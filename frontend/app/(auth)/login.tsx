import { Link, router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import LottieLoader from "../../components/LottieLoader";
import { supabase } from "../../lib/supabase";

const COLORS = {
  background: "#E6F1F5",
  accent: "#72B5A4",
  button: "#6C63FF",
  inputBg: "#F2F6F8",
  inputBorder: "#B6E0E5",
  text: "#22223B",
  link: "#1976D2",
  error: "#E57373",
  shadow: "#B6E0E5",
};
const SERVER_URL=process.env.EXPO_PUBLIC_SERVER_URL!;



export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && data.session.user) {
        router.replace("/");
      }
    };
    checkSession();
  }, []);

  const syncUserProfile = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        const response = await fetch(`${SERVER_URL}/api/users/profile/sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const userProfile = await response.json();
          console.log("User profile synced:", userProfile);
          return userProfile;
        } else {
          const errorData = await response.json();
          console.error("Profile sync failed:", errorData);
          throw new Error(errorData.detail || "Profile sync failed");
        }
      } else {
        throw new Error("No valid session found");
      }
    } catch (error) {
      console.error("Error syncing profile:", error);
      throw error;
    }
  };

  async function handleLogin() {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert("Login failed", error.message);
        return;
      }

      // Verify session was created
      if (!data.session) {
        Alert.alert("Login failed", "No session created");
        return;
      }

      console.log("Login successful, session:", data.session.user.id);

      // Small delay to ensure session is persisted
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify session persistence
      const {
        data: { session: persistedSession },
      } = await supabase.auth.getSession();
      if (!persistedSession) {
        console.warn("Session not persisted properly");
      }

      try {
        await syncUserProfile();
        console.log("Profile synced successfully");
      } catch (syncError) {
        console.warn("Profile sync failed, but login succeeded:", syncError);
      }

      // Navigate to home
      router.replace("/");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      Alert.alert("Login failed", errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.outerContainer}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <LottieLoader
            source={require("../../assets/lottie/login.json")}
            style={{ width: 180, height: 180 }}
          />
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>
            Your journey awaits, login to continue.
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
            returnKeyType="next"
            blurOnSubmit={false}
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
            returnKeyType="done"
          />
          {/* <View style={{ alignItems: "flex-end", marginTop: 8 }}>
            <Link href="/forget-password" style={styles.forgotLink}>
              Forgot Password?
            </Link>
          </View> */}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    minHeight: "100%",
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
  forgotLink: {
    color: COLORS.link,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
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
