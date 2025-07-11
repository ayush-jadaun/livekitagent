import { Link, router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import LottieLoader from "../../components/LottieLoader";
import { supabase } from "../../lib/supabase";

const SERVER_URL = "http://10.140.228.175:8000";

// Colors based on color psychology for mental health apps
const COLORS = {
  background: "#F5E6F7",
  accent: "#A3D9C9",
  button: "#6C63FF",
  inputBg: "#FAF7FF",
  inputBorder: "#D1C4E9",
  text: "#22223B",
  link: "#1976D2",
  error: "#E57373",
  shadow: "#D1C4E9",
};

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to home page
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && data.session.user) {
        router.replace("/");
      }
    };
    checkSession();
  }, []);

  async function handleSignup() {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter your name");
      return;
    }
    if (!age.trim() || isNaN(Number(age))) {
      Alert.alert("Error", "Please enter a valid age");
      return;
    }

    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setLoading(false);
      Alert.alert("Signup failed", signUpError.message);
      return;
    }

    // After signup, get the session and call user setup
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      setLoading(false);
      Alert.alert(
        "Error",
        "Signup successful, but could not authenticate session. Please login."
      );
      router.push("/login");
      return;
    }

    try {
      // Call your user setup endpoint
      const response = await fetch(`${SERVER_URL}/api/users/setup`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          age: parseInt(age),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      Alert.alert(
        "Signup successful!",
        "Check your email to confirm your account. Profile setup complete!"
      );
      router.push("/login");
    } catch (error) {
      let message = "Signup succeeded, but profile setup failed";
      if (error instanceof Error) {
        message += `: ${error.message}`;
      }
      Alert.alert("Error", message);
      router.push("/login");
    } finally {
      setLoading(false);
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
            source={require("../../assets/lottie/signup.json")}
            style={{ width: 180, height: 180 }}
          />
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Begin your mindful journey. Your safe space for self-care starts
            here!
          </Text>
        </View>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor="#7a8fa6"
            autoCapitalize="words"
            onChangeText={setName}
            value={name}
          />
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your age"
            placeholderTextColor="#7a8fa6"
            keyboardType="numeric"
            onChangeText={setAge}
            value={age}
          />
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
            placeholder="Create a password"
            placeholderTextColor="#7a8fa6"
            autoCapitalize="none"
            secureTextEntry
            onChangeText={setPassword}
            value={password}
          />
        </View>
        <TouchableOpacity
          style={[styles.button, loading && { backgroundColor: "#A3A0FB" }]}
          onPress={handleSignup}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            {loading ? "Signing Up..." : "Sign Up"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.footerText}>
          Already have an account?{" "}
          <Link href="/login" style={styles.linkText}>
            Login
          </Link>
        </Text>
        <View style={styles.hintContainer}>
          <Text style={styles.hintText}>
            Your information is private, secure, and never shared.
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
    color: "#4F5D75",
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
