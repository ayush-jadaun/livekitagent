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

import { Track} from "livekit-client";

registerGlobals();

const SERVER_URL = "http://192.168.34.175:8000";

export default function App() {
  const [wsURL, setWsURL] = useState("");
  const [token, setToken] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [roomName, setRoomName] = useState("my-room");
  const [userName, setUserName] = useState("User");

  // Start the audio session
  useEffect(() => {
    let start = async () => {
      await AudioSession.startAudioSession();
    };
    start();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  const fetchTokenAndConfig = async () => {
    console.log("token requested")
    setLoading(true);
    try {

      const identity = `user_${Date.now()}`;

  
      const [tokenResponse, configResponse] = await Promise.all([
        fetch(
          `${SERVER_URL}/getToken?room=${roomName}&identity=${identity}&name=${userName}`
        ),
        fetch(`${SERVER_URL}/config`),
      ]);

      if (!tokenResponse.ok || !configResponse.ok) {
        throw new Error("Failed to fetch token or config");
      }

      const tokenData = await tokenResponse.text();
      const configData = await configResponse.json();

      setToken(tokenData);
      setWsURL(configData.livekit_url);
      setIsConnected(true);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Alert.alert("Error", `Failed to connect: ${errMsg}`);
      console.error("Connection error:", error);
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    setIsConnected(false);
    setToken("");
    setWsURL("");
  };

  if (!isConnected) {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.title}>LiveKit Video Call</Text>

        <TextInput
          style={styles.input}
          placeholder="Room Name"
          value={roomName}
          onChangeText={setRoomName}
        />

        <TextInput
          style={styles.input}
          placeholder="Your Name"
          value={userName}
          onChangeText={setUserName}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={fetchTokenAndConfig}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Join Room</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={wsURL}
      token={token}
      connect={true}
      options={{
        adaptiveStream: { pixelDensity: "screen" },
      }}
      audio={true}

    >
      <RoomView onDisconnect={disconnect} roomName={roomName} />
    </LiveKitRoom>
  );
}

type RoomViewProps = {
  onDisconnect: () => void;
  roomName: string;
};

const RoomView: React.FC<RoomViewProps> = ({ onDisconnect, roomName }) => {
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
        <Text style={styles.roomTitle}>Room: {roomName}</Text>
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
    marginBottom: 30,
    color: "#333",
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
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingTop: 50, // Account for status bar
  },
  roomTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
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
