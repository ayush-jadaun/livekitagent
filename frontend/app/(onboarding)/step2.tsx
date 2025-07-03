import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import LottieLoader from "../../components/LottieLoader";
import { router } from "expo-router";

const { width, height } = Dimensions.get("window");

export default function OnboardingStep2() {
  return (
    <View style={styles.container}>
      <View style={styles.animationContainer}>
        <LottieLoader
          source={require("../../assets/lottie/onboarding2.json")}
          style={styles.lottie}
        />
      </View>

      <View style={styles.contentContainer}>
        <Text style={styles.title}>Daily Check-Ins</Text>
        <Text style={styles.subtitle}>Track your mood & reflect daily</Text>

        <View style={styles.textContainer}>
          <Text style={styles.description}>
            Build self-awareness with quick daily mood tracking.
          </Text>
          <Text style={styles.benefit}>
            Watch your progress unfold over time.
          </Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => router.push("/(onboarding)/step3")}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#B6E2D3",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  animationContainer: {
    flex: 0.4,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  lottie: {
    width: width * 0.7,
    height: width * 0.7,
    maxWidth: 280,
    maxHeight: 280,
  },
  contentContainer: {
    flex: 0.45,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#2E7D32",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#388E3C",
    textAlign: "center",
    marginBottom: 32,
    opacity: 0.9,
  },
  textContainer: {
    paddingHorizontal: 8,
  },
  description: {
    fontSize: 17,
    lineHeight: 26,
    color: "#2D3A4A",
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "400",
  },
  benefit: {
    fontSize: 16,
    lineHeight: 24,
    color: "#3E4A59",
    textAlign: "center",
    fontStyle: "italic",
    opacity: 0.85,
  },
  buttonContainer: {
    flex: 0.15,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  nextButton: {
    backgroundColor: "#388E3C",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 28,
    width: "80%",
    maxWidth: 280,
    elevation: 3,
    shadowColor: "#388E3C",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  nextButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.5,
  },
});
