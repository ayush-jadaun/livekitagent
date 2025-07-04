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

registerGlobals();

const { width, height } = Dimensions.get("window");
const SERVER_URL = "http://192.168.34.175:8000";

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
  const [autoStartAttempted, setAutoStartAttempted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

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

  useEffect(() => {
    if (user && !isConnected && !autoStartAttempted && !loading && !error) {
      setAutoStartAttempted(true);
      initializeAndStartCall();
    }
  }, [user, isConnected, autoStartAttempted, loading, error]);

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
    } catch (error) {
      // Don't show error if server is offline on endSession
      console.error("Error ending session:", error);
    }

    setIsConnected(false);
    setCurrentSession(null);
    setToken("");
    setWsURL("");
    setAutoStartAttempted(false);

    router.replace("/");
  };

  const handleCancel = async (): Promise<void> => {
    await endSession();
  };

  const retryConnection = async (): Promise<void> => {
    setError(null);
    setAutoStartAttempted(false);
    setLoading(false);
    await initializeAndStartCall();
  };

  if (!user) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>LiveKit Call</Text>
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

  if (loading || (user && !autoStartAttempted)) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>Connecting...</Text>
        <Text style={styles.subtitle}>
          {roomInfo ? "Starting your call" : "Setting up your room"}
        </Text>
        <ActivityIndicator
          size="large"
          color="#007AFF"
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

  return (
    <View style={styles.setupContainer}>
      <Text style={styles.title}>Connection Failed</Text>
      <Text style={styles.subtitle}>Logged in as: {user.email}</Text>

      {roomInfo && (
        <View style={styles.roomInfo}>
          <Text style={styles.roomText}>Your Room: {roomInfo.room_name}</Text>
          <Text style={styles.statusText}>
            Status: {roomInfo.room_condition === "on" ? "Active" : "Ready"}
          </Text>
        </View>
      )}

      <Text style={styles.note}>Auto-connect failed. Try again:</Text>

      <TouchableOpacity
        style={[styles.button, styles.callButton]}
        onPress={retryConnection}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Retry Connection</Text>
        )}
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
  const tracks = useTracks([Track.Source.Camera]);

  const renderTrack: ListRenderItem<TrackReferenceOrPlaceholder> = ({
    item,
  }) => {
    if (isTrackReference(item)) {
      return <VideoTrack trackRef={item} style={styles.participantView} />;
    } else {
      return (
        <View style={styles.participantView}>
          <Text style={styles.placeholderText}>No Video</Text>
        </View>
      );
    }
  };

  return (
    <SafeAreaView style={styles.callContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />

      {/* Header */}
      <View style={styles.callHeader}>
        <View style={styles.callHeaderContent}>
          <Text style={styles.callRoomTitle}>{roomName}</Text>
          {sessionId && (
            <Text style={styles.callSessionText}>
              ID: {sessionId.substring(0, 8)}...
            </Text>
          )}
        </View>
      </View>

      {/* Main content area */}
      <View style={styles.callContent}>
        <FlatList
          data={tracks}
          renderItem={renderTrack}
          keyExtractor={(item, index) => index.toString()}
          style={styles.tracksList}
          contentContainerStyle={styles.tracksContainer}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Footer with controls */}
      <View style={styles.callFooter}>
        <View style={styles.callControls}>
          <TouchableOpacity
            style={styles.endCallButton}
            onPress={onDisconnect}
            activeOpacity={0.8}
          >
            <Text style={styles.endCallText}>End Call</Text>
          </TouchableOpacity>
        </View>
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
    backgroundColor: "#f5f5f5",
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
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
    backgroundColor: "#34C759",
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
  // Call screen styles
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
  callSessionText: {
    color: "#ccc",
    fontSize: 14,
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
    backgroundColor: "#FF3B30",
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
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
    color: "#ccc",
    fontSize: 16,
    fontWeight: "500",
  },
});
