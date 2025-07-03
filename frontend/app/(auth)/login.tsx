import { Link, router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  KeyboardAvoidingView,
  Image,
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
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if user is already logged in, redirect to home if so
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && data.session.user) {
        router.replace("/");
      }
    };
    checkSession();
  }, []);

  async function handleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      Alert.alert("Login failed", error.message);
    } else {
      router.replace("/");
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
            source={require("../../assets/lottie/login.json")}
            style={{ width: 180, height: 180 }}
          />
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>
            We're glad to see you again! Log in to continue your mindful
            journey.
          </Text>
        </View>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#7a8fa6"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            value={email}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#7a8fa6"
            autoCapitalize="none"
            secureTextEntry
            onChangeText={setPassword}
            value={password}
          />
        </View>
        <TouchableOpacity
          style={[styles.button, loading && { backgroundColor: "#A3A0FB" }]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            {loading ? "Logging in..." : "Login"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.footerText}>
          Don't have an account?{" "}
          <Link href="/signup" style={styles.linkText}>
            Sign up
          </Link>
        </Text>
        <View style={styles.hintContainer}>
          <Text style={styles.hintText}>
            Your information is secure and confidential.
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
  },
  hintText: {
    fontSize: 13,
    color: "#8bb0c9",
    opacity: 0.85,
  },
});
