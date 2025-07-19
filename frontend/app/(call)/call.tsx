import * as React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Dimensions,
  BackHandler,
  Image,
  Animated,
} from "react-native";
import { useState, useEffect, useRef } from "react";
import {
  AudioSession,
  LiveKitRoom,
  registerGlobals,
  useRoomContext, // Correct hook
  useRemoteParticipants, // Correct hook
} from "@livekit/react-native";
import { User } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";

registerGlobals();

const { width, height } = Dimensions.get("window");
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL;

console.log("Server URL:", SERVER_URL);

// ---- Interfaces ---- //
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

// ---- Main App Component ---- //
export default function App() {
  const [wsURL, setWsURL] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentSession, setCurrentSession] = useState<CurrentSession | null>(
    null
  );
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shouldAutoStart, setShouldAutoStart] = useState<boolean>(true);

  const router = useRouter();

  const endSession = React.useCallback(async (): Promise<void> => {
    if (!currentSession || !user) return;
    setShouldAutoStart(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(
        `${SERVER_URL}/api/sessions/${currentSession.session_id}/end`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      console.log("Session ended successfully on the server.");
    } catch (e) {
      console.error("Error ending session:", e);
    } finally {
      setIsConnected(false);
      setCurrentSession(null);
      setToken("");
      setWsURL("");
    }
  }, [currentSession, user]);

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (isConnected) {
          Alert.alert(
            "End Call",
            "Are you sure you want to end the call and go back?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "End Call",
                onPress: async () => {
                  await endSession();
                  if (router) router.back();
                },
                style: "destructive",
              },
            ]
          );
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );
      return () => subscription.remove();
    }, [isConnected, endSession, router])
  );

  useEffect(() => {
    const start = async () => {
      await AudioSession.startAudioSession();
      await checkAuth();
    };
    start();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  const initializeAndStartCall = React.useCallback(async (): Promise<void> => {
    if (!user) {
      setError("User not authenticated.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!(await checkServerOnline())) {
        throw new Error("The server is offline. Please try again later.");
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session found.");
      let room = await checkExistingRoom(session.access_token);
      if (!room) {
        console.log("No existing room found, creating a new one...");
        room = await createRoom(session.access_token);
        if (!room) throw new Error("Failed to create a new room.");
      }
      setRoomInfo(room);
      console.log("Room initialized:", room.room_name);
      await startSession(session.access_token, room);
    } catch (e: any) {
      console.error("Initialize and start call error:", e);
      setError(e.message || "An unexpected error occurred.");
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !isConnected && !loading && !error && shouldAutoStart) {
      initializeAndStartCall();
    }
  }, [
    user,
    isConnected,
    loading,
    error,
    shouldAutoStart,
    initializeAndStartCall,
  ]);

  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => {
        if (router) router.replace("/");
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [error, router]);

  const checkAuth = async (): Promise<void> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
      } else {
        if (router) router.replace("/login");
        console.log("User not authenticated, redirecting.");
      }
    } catch (e) {
      console.error("Error checking auth:", e);
      setError("Could not verify your session.");
    } finally {
      setLoading(false);
    }
  };

  const checkServerOnline = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${SERVER_URL}/ping`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (e) {
      return false;
    }
  };

  const checkExistingRoom = async (
    accessToken: string
  ): Promise<RoomInfo | null> => {
    const response = await fetch(`${SERVER_URL}/api/users/room`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) return response.json();
    return null;
  };

  const createRoom = async (accessToken: string): Promise<RoomInfo | null> => {
    const response = await fetch(`${SERVER_URL}/api/rooms/create`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const roomData: CreateRoomResponse = await response.json();
      return { ...roomData, room_condition: "off" };
    }
    return null;
  };

  const startSession = async (
    accessToken: string,
    room: RoomInfo
  ): Promise<void> => {
    const response = await fetch(`${SERVER_URL}/api/sessions/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) throw new Error("Failed to start the session.");
    const sessionData: CurrentSession = await response.json();
    setCurrentSession(sessionData);
    setToken(sessionData.token);
    setWsURL(sessionData.livekit_url);
    setIsConnected(true);
    console.log("Session started:", sessionData.session_id);
    setLoading(false);
  };

  const handleCancel = () => {
    setShouldAutoStart(false);
    if (router) router.replace("/");
  };

  const retryConnection = () => {
    setError(null);
    setShouldAutoStart(true);
  };

  if (loading) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>
          {roomInfo ? "🔥 Connecting..." : "Setting up..."}
        </Text>
        <Text style={styles.subtitle}>
          {roomInfo ? "Starting your session" : "Finding your safe space"}
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

  if (error) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>Connection Error</Text>
        <Text style={styles.subtitle}>{error}</Text>
        <Text style={styles.note}>Redirecting to the homepage...</Text>
        <TouchableOpacity
          style={[styles.button, styles.callButton]}
          onPress={retryConnection}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.buttonText}>Go to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isConnected && wsURL && token) {
    return (
      <LiveKitRoom serverUrl={wsURL} token={token} connect={true} audio={true}>
        <RoomView onDisconnect={endSession} />
      </LiveKitRoom>
    );
  }

  return (
    <View style={styles.setupContainer}>
      <Text style={styles.title}>Welcome</Text>
      <TouchableOpacity style={styles.button} onPress={initializeAndStartCall}>
        <Text style={styles.buttonText}>Start Call</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---- LiveKit RoomView Component ---- //
interface RoomViewProps {
  onDisconnect: () => void;
}

const RoomView: React.FC<RoomViewProps> = ({ onDisconnect }) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(
    "Agent is joining, please wait..."
  );
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Get reactive room state and participants
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();

  const participantCount = remoteParticipants.length + 1;

  // IMPORTANT: Change 'agent-identity' to match your AI agent's identity
  const agent = remoteParticipants[0];

  // --- THE FIX ---
  // Access the `isSpeaking` property directly. This is safe and reactive.
  const isAgentSpeaking = agent?.isSpeaking ?? false;
  const isUserSpeaking = room.localParticipant?.isSpeaking ?? false;
  // --- END OF FIX ---

  useEffect(() => {
    // Logic to handle agent joining message
    if (participantCount > 1 && statusMessage !== null) {
      setStatusMessage("Agent has joined. Begin.");
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => setStatusMessage(null));
    } else if (participantCount <= 1) {
      setStatusMessage("Agent is joining, please wait...");
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [participantCount]);

  const getSpeakingStatus = (): string => {
    if (isAgentSpeaking) return "Replying...";
    if (isUserSpeaking) return "Listening...";
    return "";
  };

  return (
    <SafeAreaView style={styles.metalCallContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <View style={styles.metalCallContent}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/images/rsml.png")} // Make sure path is correct
            style={styles.logoPlaceholder}
          />
        </View>
        <View style={styles.brandContainer}>
          <Text style={styles.brandText}>Rasmlai</Text>
        </View>
        <View style={styles.statusContainer}>
          <Animated.Text
            style={[
              styles.statusText,
              { opacity: statusMessage ? fadeAnim : 1 },
            ]}
          >
            {statusMessage ?? getSpeakingStatus()}
          </Animated.Text>
        </View>
        <View style={styles.spacer} />
        <View style={styles.controlContainer}>
          <TouchableOpacity
            style={[styles.controlButton, styles.endCallButton]}
            onPress={onDisconnect}
            activeOpacity={0.8}
          >
            <View style={styles.controlButtonInner}>
              <Text style={styles.controlButtonText}>END</Text>
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.bottomSpacer} />
      </View>
    </SafeAreaView>
  );
};

// ---- Styles ---- //
const styles = StyleSheet.create({
  setupContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#1a1a1a",
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
    color: "#ccc",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#E53E3E",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    minWidth: 150,
    alignItems: "center",
    marginBottom: 10,
  },
  callButton: {
    backgroundColor: "#4CAF50",
  },
  logoutButton: {
    backgroundColor: "#888",
    paddingVertical: 10,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  roomInfo: {
    backgroundColor: "#2c2c2c",
    padding: 15,
    borderRadius: 10,
    marginVertical: 20,
    width: "90%",
    alignItems: "center",
  },
  roomText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  note: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    marginTop: 15,
    fontStyle: "italic",
  },
  metalCallContainer: {
    flex: 1,
    backgroundColor: "#0a0a0a",
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
    backgroundColor: "transparent",
    borderRadius: 60,
  },
  brandContainer: {
    marginBottom: 20,
  },
  brandText: {
    fontSize: 30,
    fontWeight: "300",
    color: "#ffffff",
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: "monospace",
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  statusContainer: {
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  statusText: {
    fontSize: 18,
    color: "white",
    textAlign: "center",
    fontWeight: "500",
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 15,
  },
  endCallButton: {
    backgroundColor: "#E53E3E",
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
});
