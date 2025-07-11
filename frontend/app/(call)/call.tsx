import * as React from "react";
import {
  StyleSheet,
  View,
  FlatList,
  ListRenderItem,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions,
  BackHandler,
} from "react-native";
import { useState, useEffect } from "react";
import {
  AudioSession,
  LiveKitRoom,
  useTracks,
  TrackReferenceOrPlaceholder,
  VideoTrack,
  isTrackReference,
  registerGlobals,
} from "@livekit/react-native";
import { Track } from "livekit-client";
import { supabase } from "../../lib/supabase";
import { User } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

registerGlobals();

const { width, height } = Dimensions.get("window");
const SERVER_URL = "http://10.140.228.175:8000";

interface RoomInfo {
  room_id: string;
  room_name: string;
  room_condition: "on" | "off";
}

interface CurrentSession {
  session_id: string;
  room_name: string;
  token: string;
  livekit_url: string;
  expires_at: string;
}

interface CreateRoomResponse {
  room_id: string;
  room_name: string;
}

export default function App() {
  const [wsURL, setWsURL] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentSession, setCurrentSession] = useState<CurrentSession | null>(
    null
  );
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shouldAutoStart, setShouldAutoStart] = useState<boolean>(true);

  const router = useRouter();

  // Handle back button press when in call
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (isConnected) {
          Alert.alert(
            "End Call",
            "Are you sure you want to end the call and go back?",
            [
              {
                text: "Cancel",
                onPress: () => null,
                style: "cancel",
              },
              {
                text: "End Call",
                onPress: async () => {
                  await endSession();
                  router.back();
                },
                style: "destructive",
              },
            ]
          );
          return true; // Prevent default back action
        }
        return false; // Allow default back action
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );

      return () => subscription.remove();
    }, [isConnected])
  );

  // Check if the server is online (simple /ping endpoint or fallback to base url)
  const checkServerOnline = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${SERVER_URL}/ping`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) return true;
      return false;
    } catch (e) {
      return false;
    }
  };

  useEffect(() => {
    let start = async () => {
      await AudioSession.startAudioSession();
      await checkAuth();
    };
    start();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  // Auto-start call when user is authenticated
  useEffect(() => {
    if (user && !isConnected && !loading && !error && shouldAutoStart) {
      initializeAndStartCall();
    }
  }, [user, isConnected, loading, error, shouldAutoStart]);

  // After showing error, push user to homepage after 2-3 seconds
  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => {
        router.replace("/");
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  const checkAuth = async (): Promise<void> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
      } else {
        router.navigate("/login");
        console.log("User not authenticated");
      }
    } catch (error) {
      console.error("Error checking auth:", error);
    }
  };

  const checkExistingRoom = async (
    accessToken: string
  ): Promise<RoomInfo | null> => {
    try {
      const response = await fetch(`${SERVER_URL}/api/users/room`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const roomData: RoomInfo = await response.json();
        return roomData;
      }
      return null;
    } catch (error) {
      // Server likely offline/network error
      throw new Error("Server is offline. Please try again later.");
    }
  };

  const createRoom = async (accessToken: string): Promise<RoomInfo | null> => {
    try {
      const response = await fetch(`${SERVER_URL}/api/rooms/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const roomData: CreateRoomResponse = await response.json();
        return {
          room_id: roomData.room_id,
          room_name: roomData.room_name,
          room_condition: "off",
        };
      }
      return null;
    } catch (error) {
      // Server likely offline/network error
      throw new Error("Server is offline. Please try again later.");
    }
  };

  const initializeAndStartCall = async (): Promise<void> => {
    if (!user) {
      Alert.alert("Error", "User not authenticated");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check if server is online first
      const online = await checkServerOnline();
      if (!online) {
        throw new Error(
          "The server appears to be offline. Please try again later."
        );
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("No active session");
      }

      let room = await checkExistingRoom(session.access_token);

      if (!room) {
        console.log("No existing room found, creating new room...");
        room = await createRoom(session.access_token);

        if (!room) {
          throw new Error("Failed to create room");
        }
      }

      setRoomInfo(room);
      console.log("Room initialized:", room.room_name);

      await startSession(session.access_token, room);
    } catch (error: any) {
      console.error("Initialize and start call error:", error);
      setError(
        error?.message ||
          "Failed to initialize call. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const startSession = async (
    accessToken: string,
    room: RoomInfo
  ): Promise<void> => {
    try {
      const response = await fetch(`${SERVER_URL}/api/sessions/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start session");
      }

      const sessionData: CurrentSession = await response.json();

      setCurrentSession(sessionData);
      setToken(sessionData.token);
      setWsURL(sessionData.livekit_url);
      setIsConnected(true);

      console.log("Session started:", sessionData.session_id);
      console.log("Room:", sessionData.room_name);
    } catch (error) {
      // Server likely offline/network error
      throw new Error("Server is offline. Please try again later.");
    }
  };

  const endSession = async (): Promise<void> => {
    if (!currentSession || !user) return;
    setShouldAutoStart(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${SERVER_URL}/api/sessions/${currentSession.session_id}/end`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        console.log("Session ended successfully");
      }
      router.replace("/");
    } catch (error) {
      // Don't show error if server is offline on endSession
      console.error("Error ending session:", error);
    }

    setIsConnected(false);
    setCurrentSession(null);
    setToken("");
    setWsURL("");
  };

  const handleCancel = async (): Promise<void> => {
    setShouldAutoStart(false); // Prevent auto-restart
    await endSession();
  };

  const retryConnection = async (): Promise<void> => {
    setError(null);
    setLoading(false);
    setShouldAutoStart(true); // Allow auto-start for retry
    await initializeAndStartCall();
  };

  if (!user) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>Rasmlai</Text>
        <Text style={styles.subtitle}>Please log in to continue</Text>
        <Text style={styles.note}>Redirecting to login...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>Connection Error</Text>
        <Text style={styles.subtitle}>{error}</Text>
        <Text style={styles.note}>
          You will be redirected to the homepage shortly...
        </Text>
        <TouchableOpacity
          style={[styles.button, styles.callButton]}
          onPress={retryConnection}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={handleCancel}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isConnected) {
    return (
      <LiveKitRoom
        serverUrl={wsURL}
        token={token}
        connect={true}
        options={{
          adaptiveStream: { pixelDensity: "screen" },
        }}
        audio={true}
        video={false}
      >
        <RoomView
          onDisconnect={endSession}
          roomName={roomInfo?.room_name || "Unknown Room"}
          sessionId={currentSession?.session_id}
        />
      </LiveKitRoom>
    );
  }

  // Loading state - show while connecting
  if (loading) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>🔥 Connecting...</Text>
        <Text style={styles.subtitle}>
          {roomInfo
            ? "Starting your vent session"
            : "Setting up your safe space"}
        </Text>
        <ActivityIndicator
          size="large"
          color="#E53E3E"
          style={{ marginTop: 20 }}
        />

        {roomInfo && (
          <View style={styles.roomInfo}>
            <Text style={styles.roomText}>Room: {roomInfo.room_name}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={handleCancel}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

interface RoomViewProps {
  onDisconnect: () => void;
  roomName: string;
  sessionId?: string;
}

const RoomView: React.FC<RoomViewProps> = ({
  onDisconnect,
  roomName,
  sessionId,
}) => {
  const [isCallActive, setIsCallActive] = useState(true);
  const tracks = useTracks([Track.Source.Camera]);

  const handleEndCall = () => {
    setIsCallActive(false);
    onDisconnect();
  };


  return (
    <SafeAreaView style={styles.metalCallContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Main Content */}
      <View style={styles.metalCallContent}>
        {/* Logo Space */}
        <View style={styles.logoContainer}>
          {/* Add your logo component here */}
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>LOGO</Text>
          </View>
        </View>

        {/* R_AI Text */}
        <View style={styles.brandContainer}>
          <Text style={styles.brandText}>Rasmalai</Text>
        </View>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Control Button */}
        <View style={styles.controlContainer}>
          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.endCallButton
            ]}
            onPress={ handleEndCall }
            activeOpacity={0.8}
          >
            <View style={styles.controlButtonInner}>
              <Text style={styles.controlButtonText}>
                { "END"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  setupContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFE6E6",
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#E53E3E",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    color: "#666",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
    marginBottom: 10,
  },
  callButton: {
    backgroundColor: "#E53E3E",
    paddingHorizontal: 40,
    paddingVertical: 20,
  },
  logoutButton: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  roomInfo: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    marginBottom: 30,
    width: "100%",
    alignItems: "center",
  },
  roomText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  statusText: {
    fontSize: 14,
    color: "#666",
  },
  note: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 10,
    fontStyle: "italic",
  },

  // New Metal Call Screen Styles
  metalCallContainer: {
    flex: 1,
    backgroundColor: "#0a0a0a", // Deep black metal background
  },
  metalCallContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 60,
  },
  logoContainer: {
    marginTop: 40,
    marginBottom: 30,
    alignItems: "center",
  },
  logoPlaceholder: {
    width: 120,
    height: 120,
    backgroundColor: "#1a1a1a",
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  logoText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  brandContainer: {
    marginBottom: 40,
  },
  brandText: {
    fontSize:30,
    fontWeight: "300",
    color: "#ffffff",
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: "monospace",
    textShadowColor: "#000",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  spacer: {
    flex: 1,
  },
  controlContainer: {
    alignItems: "center",
    marginBottom: 80,
  },
  controlButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 15,
  },
  startCallButton: {
    backgroundColor: "#1a1a1a",
    borderWidth: 3,
    borderColor: "#00ff00",
  },
  controlButtonInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#0a0a0a",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  controlButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 2,
    textAlign: "center",
  },
  bottomSpacer: {
    height: 60,
  },

  // Legacy styles (keeping for other screens)
  callContainer: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  callHeader: {
    backgroundColor: "#2c2c2c",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#404040",
  },
  callHeaderContent: {
    alignItems: "center",
  },
  callRoomTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  callSubtitle: {
    color: "#FF6B6B",
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
    fontStyle: "italic",
  },
  callSessionText: {
    color: "#ccc",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  callContent: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  callFooter: {
    backgroundColor: "#2c2c2c",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: "#404040",
  },
  callControls: {
    alignItems: "center",
    justifyContent: "center",
  },
  endCallButton: {
    backgroundColor: "#E53E3E",
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 1200,
    minWidth: 140,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  endCallText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  tracksList: {
    flex: 1,
  },
  tracksContainer: {
    padding: 10,
  },
  participantView: {
    height: Math.min(height * 0.4, 300),
    marginVertical: 10,
    marginHorizontal: 10,
    backgroundColor: "#333",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
  },
  placeholderText: {
    color: "#FF6B6B",
    fontSize: 16,
    fontWeight: "500",
  },
});
