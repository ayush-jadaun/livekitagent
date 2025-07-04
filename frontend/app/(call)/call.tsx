import * as React from "react";
import {
  StyleSheet,
  View,
  FlatList,
  ListRenderItem,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
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
  expires_at: string
}

interface SetupResponse {
  room_id: string;
  room_name: string;
}

export default function App() {
  const [wsURL, setWsURL] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>("");
  const [userAge, setUserAge] = useState<string>("");
  const [isSetup, setIsSetup] = useState<boolean>(false);
  const [currentSession, setCurrentSession] = useState<CurrentSession | null>(
    null
  );
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const router = useRouter();

  // Start the audio session and check auth
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

  const checkAuth = async (): Promise<void> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await checkUserSetup(session.access_token);
      } else {
        // User is not authenticated - redirect to login
        router.navigate("/login");
        console.log("User not authenticated");
      }
    } catch (error) {
      console.error("Error checking auth:", error);
    }
  };

  const checkUserSetup = async (accessToken: string): Promise<void> => {
    try {
      const response = await fetch(`${SERVER_URL}/api/users/room`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const roomData: RoomInfo = await response.json();
        setRoomInfo(roomData);
        setIsSetup(true);
      }
    } catch (error) {
      console.error("Error checking user setup:", error);
    }
  };


  const setupUser = async (): Promise<void> => {
    if (!userName.trim()) {
      Alert.alert("Error", "Please enter your name");
      return;
    }

    if (!user) {
      Alert.alert("Error", "User not authenticated");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Session error:", sessionError);
        throw new Error("Failed to get session");
      }

      if (!session) {
        throw new Error("No active session");
      }

      console.log(
        "Sending request with token:",
        session.access_token.substring(0, 20) + "..."
      );

      const response = await fetch(`${SERVER_URL}/api/users/setup`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: userName,
          age: userAge ? parseInt(userAge) : null,
        }),
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Setup error response:", errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const setupData: SetupResponse = await response.json();
      setRoomInfo({
        room_id: setupData.room_id,
        room_name: setupData.room_name,
        room_condition: "off",
      });
      setIsSetup(true);

      Alert.alert("Success", "Profile setup complete!");
    } catch (error) {
      console.error("Setup error:", error);
      let message = "Failed to setup profile";
      if (error instanceof Error) {
        message += `: ${error.message}`;
      }
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };


  const debugToken = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        console.log("User ID:", session.user.id);
        console.log("Token expires at:", new Date(session.expires_at! * 1000));
        console.log(
          "Token preview:",
          session.access_token.substring(0, 50) + "..."
        );

        // Decode token to see payload 
        const base64Payload = session.access_token.split(".")[1];
        const payload = JSON.parse(atob(base64Payload));
        console.log("Token payload:", payload);
      }
    } catch (error) {
      console.error("Debug token error:", error);
    }
  };

  // Call this before making API calls to debug
  debugToken();

  const startSession = async (): Promise<void> => {
    if (!roomInfo) {
      Alert.alert("Error", "Room not initialized");
      return;
    }

    if (!user) {
      Alert.alert("Error", "User not authenticated");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No active session");
      }

      const response = await fetch(`${SERVER_URL}/api/sessions/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
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
      console.error("Session start error:", error);
      Alert.alert("Error", "Failed to start call");
    } finally {
      setLoading(false);
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
      console.error("Error ending session:", error);
    }

    // Reset connection state
    setIsConnected(false);
    setCurrentSession(null);
    setToken("");
    setWsURL("");
  };

  const handleLogout = async (): Promise<void> => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setIsSetup(false);
      setRoomInfo(null);
      router.navigate("/login")
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // If no user, show message (in practice, you'd navigate to login)
  if (!user) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>LiveKit Call</Text>
        <Text style={styles.subtitle}>Please log in to continue</Text>
        <Text style={styles.note}>Redirecting to login...</Text>
      </View>
    );
  }

  // If not setup, show setup screen
  if (!isSetup) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>Setup Your Profile</Text>
        <Text style={styles.subtitle}>Welcome, {user.email}!</Text>

        <TextInput
          style={styles.input}
          placeholder="Your Name *"
          value={userName}
          onChangeText={setUserName}
        />

        <TextInput
          style={styles.input}
          placeholder="Your Age (optional)"
          value={userAge}
          onChangeText={setUserAge}
          keyboardType="numeric"
        />

        <TouchableOpacity
          style={styles.button}
          onPress={setupUser}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Complete Setup</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // If connected, show room view
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

  // Main screen - ready to call
  return (
    <View style={styles.setupContainer}>
      <Text style={styles.title}>Welcome, {userName}!</Text>
      <Text style={styles.subtitle}>Logged in as: {user.email}</Text>

      {roomInfo && (
        <View style={styles.roomInfo}>
          <Text style={styles.roomText}>Your Room: {roomInfo.room_name}</Text>
          <Text style={styles.statusText}>
            Status: {roomInfo.room_condition === "on" ? "Active" : "Ready"}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.callButton]}
        onPress={startSession}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Start Call</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.logoutButton]}
        onPress={handleLogout}
      >
        <Text style={styles.buttonText}>Logout</Text>
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
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.roomTitle}>Room: {roomName}</Text>
          {sessionId && (
            <Text style={styles.sessionText}>
              Session: {sessionId.substring(0, 8)}...
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.disconnectButton}
          onPress={onDisconnect}
        >
          <Text style={styles.disconnectText}>Leave</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tracks}
        renderItem={renderTrack}
        keyExtractor={(item, index) => index.toString()}
        style={styles.tracksList}
      />
    </View>
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
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: "white",
    fontSize: 16,
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
    fontStyle: "italic",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingTop: 50,
  },
  roomTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  sessionText: {
    color: "#ccc",
    fontSize: 12,
    marginTop: 2,
  },
  disconnectButton: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
  },
  disconnectText: {
    color: "white",
    fontWeight: "bold",
  },
  tracksList: {
    flex: 1,
  },
  participantView: {
    height: 300,
    margin: 10,
    backgroundColor: "#333",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "white",
    fontSize: 16,
  },
});
