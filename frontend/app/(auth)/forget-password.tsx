import { Link, router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import LottieLoader from "../../components/LottieLoader";
import { supabase } from "../../lib/supabase";

// Colors based on color psychology for mental health apps
const COLORS = {
  background: "#E6F1F5", // soft blue
  accent: "#72B5A4", // turquoise for positivity
  button: "#6C63FF", // calming lavender
  inputBg: "#F2F6F8", // very light blue
  inputBorder: "#B6E0E5",
  text: "#22223B", // deep blue
  link: "#1976D2", // blue for trust
  error: "#E57373", // gentle red
  shadow: "#B6E0E5",
  success: "#81C784", // gentle green
};

export default function ForgetPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function handleForgetPassword() {
    if (!email) {
      Alert.alert("Email required", "Please enter your email address");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setEmailSent(true);
      Alert.alert(
        "Check your email",
        "We've sent you a password reset link. Please check your email and follow the instructions.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]
      );
    }
  }

  return (
    <View style={styles.outerContainer}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.headerContainer}>
          <LottieLoader
            source={require("../../assets/lottie/forgot-password.json")} // You may need to add this animation
            style={{ width: 180, height: 180 }}
          />
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>
            Don't worry! It happens to the best of us. Enter your email address
            and we'll send you a link to reset your password.
          </Text>
        </View>

        {!emailSent ? (
          <>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email address"
                placeholderTextColor="#7a8fa6"
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setEmail}
                value={email}
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && { backgroundColor: "#A3A0FB" }]}
              onPress={handleForgetPassword}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              Email sent successfully! Please check your inbox.
            </Text>
          </View>
        )}

        <Text style={styles.footerText}>
          Remember your password?{" "}
          <Link href="/login" style={styles.linkText}>
            Back to Login
          </Link>
        </Text>

        <View style={styles.hintContainer}>
          <Text style={styles.hintText}>
            If you don't receive an email within a few minutes, please check
            your spam folder.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 35,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: "#3d5a80",
    textAlign: "center",
    marginBottom: 6,
    marginTop: 2,
    opacity: 0.8,
    lineHeight: 22,
  },
  inputContainer: {
    width: "100%",
    marginBottom: 22,
  },
  label: {
    fontSize: 15,
    color: "#4F5D75",
    marginBottom: 4,
    marginTop: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  input: {
    width: "100%",
    backgroundColor: COLORS.inputBg,
    borderWidth: 1.4,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 4,
    elevation: 2,
  },
  button: {
    width: "100%",
    backgroundColor: COLORS.button,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    shadowColor: COLORS.button,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.19,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
  },
  successContainer: {
    width: "100%",
    backgroundColor: COLORS.success,
    padding: 16,
    borderRadius: 12,
    marginBottom: 22,
    alignItems: "center",
  },
  successText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  footerText: {
    fontSize: 15,
    color: "#4F5D75",
    marginTop: 8,
  },
  linkText: {
    color: COLORS.link,
    fontWeight: "bold",
    textDecorationLine: "underline",
  },
  hintContainer: {
    marginTop: 32,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  hintText: {
    fontSize: 13,
    color: "#8bb0c9",
    opacity: 0.85,
    textAlign: "center",
    lineHeight: 18,
  },
});
