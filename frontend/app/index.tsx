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

const { width } = Dimensions.get("window");

// Enhanced color palette for a mindful, calming experience
const COLORS = {
  background: "#E6F1F5", // soft blue
  card: "#FFFFFF",
  primary: "#6C63FF", // lavender
  secondary: "#A3D9C9", // mint green
  tertiary: "#FFB3BA", // soft pink for onboarding
  breathing: "#FF6B6B", // breathing button color
  breathingGlow: "#FF8E8E", // breathing glow effect
  buttonText: "#FFFFFF",
  title: "#1A1B3D", // deeper blue
  subtitle: "#4F5D75",
  shadow: "#B6E0E5",
};

export default function HomeScreen() {
  const breathingScale = useRef(new Animated.Value(1)).current;
  const breathingOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    // Create breathing animation
    const breathingAnimation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(breathingScale, {
            toValue: 1.15,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(breathingOpacity, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(breathingScale, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(breathingOpacity, {
            toValue: 0.7,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    breathingAnimation.start();

    return () => breathingAnimation.stop();
  }, []);

  const handleBreathingCallPress = () => {
    // Generate a random session ID for the breathing call
    const sessionId = `breathing-${Date.now()}`;
    // Use string interpolation with type assertion for dynamic routes
    router.push(`/call` as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mindful</Text>
        <Text style={styles.subtitle}>
          Your daily companion for peace of mind
        </Text>
      </View>

      {/* Big Breathing Call Button */}
      <View style={styles.breathingContainer}>
        <Animated.View
          style={[
            styles.breathingGlow,
            {
              transform: [{ scale: breathingScale }],
              opacity: breathingOpacity,
            },
          ]}
        />
        <TouchableOpacity
          style={styles.breathingButton}
          onPress={handleBreathingCallPress}
          activeOpacity={0.8}
        >
          <Text style={styles.breathingButtonText}>🫁</Text>
          <Text style={styles.breathingButtonLabel}>Start Breathing</Text>
          <Text style={styles.breathingButtonSubtitle}>
            Connect & Breathe Together
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push("/login")}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.push("/signup")}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Sign Up</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.onboardingLink}
          onPress={() => router.push("/(onboarding)/step1")}
          activeOpacity={0.7}
        >
          <Text style={styles.onboardingText}>View Onboarding</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 60,
  },
  header: {
    flex: 0.25,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 42,
    fontWeight: "800",
    color: COLORS.title,
    marginBottom: 16,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: COLORS.subtitle,
    textAlign: "center",
    lineHeight: 26,
    opacity: 0.9,
  },
  breathingContainer: {
    flex: 0.4,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  breathingGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.breathingGlow,
    opacity: 0.3,
  },
  breathingButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: COLORS.breathing,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.breathing,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
    zIndex: 1,
  },
  breathingButtonText: {
    fontSize: 48,
    marginBottom: 8,
  },
  breathingButtonLabel: {
    color: COLORS.buttonText,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  breathingButtonSubtitle: {
    color: COLORS.buttonText,
    fontSize: 12,
    fontWeight: "400",
    opacity: 0.9,
    textAlign: "center",
    marginTop: 4,
  },
  buttonContainer: {
    flex: 0.25,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  button: {
    width: "100%",
    paddingVertical: 18,
    borderRadius: 28,
    alignItems: "center",
    marginBottom: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
  },
  secondaryButton: {
    backgroundColor: COLORS.secondary,
    shadowColor: COLORS.secondary,
  },
  buttonText: {
    color: COLORS.buttonText,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  footer: {
    flex: 0.1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  onboardingLink: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  onboardingText: {
    color: COLORS.subtitle,
    fontSize: 16,
    fontWeight: "500",
    textDecorationLine: "underline",
    opacity: 0.8,
  },
});
