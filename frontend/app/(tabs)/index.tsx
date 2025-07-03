import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from "react-native";
import { router } from "expo-router";

const { width, height } = Dimensions.get("window");

// Enhanced red color palette
const COLORS = {
  background: "#FFE6E6", // more red-tinted background
  card: "#FFFFFF",
  primary: "#E53E3E", // strong red
  secondary: "#FF6B6B", // coral red
  tertiary: "#FFEBEE", // very light red
  accent: "#F56565", // lighter red
  buttonText: "#FFFFFF",
  title: "#2D3748", // dark gray
  subtitle: "#4A5568", // medium gray
  shadow: "#FFB3B3",
  supportive: "#38A169", // calming green
  urgent: "#C53030", // deep red for urgent
  warning: "#ED8936", // orange for warnings
  release: "#805AD5", // purple for release/calm
};

export default function HomeScreen() {
  const breathingScale = useRef(new Animated.Value(1)).current;
  const breathingOpacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Create intense pulsing animation for the main button (like a heartbeat when angry)
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(breathingScale, {
            toValue: 1.08,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(breathingOpacity, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(breathingScale, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(breathingOpacity, {
            toValue: 0.8,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulseAnimation.start();

    return () => pulseAnimation.stop();
  }, []);

  const handleMainButtonPress = () => {
    router.push(`/call` as any);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Rasmalai</Text>
        <Text style={styles.subtitle}>Your safe space to release and heal</Text>
      </View>

      {/* Full Screen Button Container */}
      <View style={styles.mainButtonContainer}>
        <Animated.View
          style={[
            styles.glowEffect,
            {
              transform: [{ scale: breathingScale }],
              opacity: breathingOpacity,
            },
          ]}
        />
        <TouchableOpacity
          style={styles.mainButton}
          onPress={handleMainButtonPress}
          activeOpacity={0.9}
        >
          <View style={styles.buttonContent}>
            <Text style={styles.mainButtonEmoji}>🔥</Text>
            <Text style={styles.mainButtonText}>Vent It Out</Text>
            <Text style={styles.mainButtonSubtext}>
              Release your anger safely
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Supportive Message */}
      <View style={styles.supportiveMessage}>
        <Text style={styles.supportiveText}>
          ❤️‍🔥 Transform your anger into strength. We're here to listen
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 48,
    fontWeight: "900",
    color: COLORS.title,
    marginBottom: 8,
    letterSpacing: 1,
    textAlign: "center",
    fontFamily: "System",
  },
  subtitle: {
    fontSize: 18,
    color: COLORS.subtitle,
    textAlign: "center",
    fontWeight: "500",
    opacity: 0.9,
  },
  mainButtonContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    position: "relative",
  },
  glowEffect: {
    position: "absolute",
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    backgroundColor: COLORS.primary,
    opacity: 0.15,
  },
  mainButton: {
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 15,
    zIndex: 1,
  },
  buttonContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  mainButtonEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  mainButtonText: {
    color: COLORS.buttonText,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 8,
  },
  mainButtonSubtext: {
    color: COLORS.buttonText,
    fontSize: 16,
    fontWeight: "500",
    opacity: 0.9,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  supportiveMessage: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: "center",
  },
  supportiveText: {
    color: COLORS.subtitle,
    fontSize: 16,
    textAlign: "center",
    fontWeight: "500",
    opacity: 0.8,
    backgroundColor: COLORS.tertiary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
});
