import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  ScrollView,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase"; // Adjust path as needed

const { width, height } = Dimensions.get("window");

// Mental health app color palette
const COLORS = {
  background: "#F8F9FA",
  primary: "#6366F1",
  secondary: "#8B5CF6",
  tertiary: "#E0E7FF",
  accent: "#EF4444",
  buttonText: "#FFFFFF",
  title: "#1F2937",
  subtitle: "#6B7280",
  shadow: "#E5E7EB",
  card: "#FFFFFF",
};

export default function ProfileScreen() {
  const [user, setUser] = useState({
    name: "Mindful User",
    email: "user@mindfulapp.com",
    joinDate: "December 2024",
    totalSessions: 42,
    currentStreak: 7,
    favoriteActivity: "Meditation",
  });

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleEditProfile = () => {
    // Navigate to edit profile screen
    console.log("Edit profile clicked");
  };

  const handleSettings = () => {
    // Navigate to settings screen
    console.log("Settings clicked");
  };

  const handleLogout = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            setIsLoggingOut(true);
            const { error } = await supabase.auth.signOut();

            if (error) {
              Alert.alert("Error", "Failed to sign out. Please try again.");
              console.error("Logout error:", error);
            } else {
              // Successfully signed out
              router.replace("/(auth)/login"); // Adjust route as needed
            }
          } catch (error) {
            Alert.alert("Error", "An unexpected error occurred.");
            console.error("Logout error:", error);
          } finally {
            setIsLoggingOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={handleEditProfile}
          activeOpacity={0.7}
        >
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Picture and Info */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>🧘</Text>
            </View>
          </View>

          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
          <Text style={styles.joinDate}>Member since {user.joinDate}</Text>
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user.totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{user.currentStreak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>156</Text>
            <Text style={styles.statLabel}>Minutes</Text>
          </View>
        </View>

        {/* Favorite Activity */}
        <View style={styles.activitySection}>
          <Text style={styles.sectionTitle}>Favorite Activity</Text>
          <View style={styles.activityCard}>
            <Text style={styles.activityEmoji}>🧘‍♂️</Text>
            <View style={styles.activityInfo}>
              <Text style={styles.activityName}>{user.favoriteActivity}</Text>
              <Text style={styles.activityDescription}>
                Mindfulness practice for inner peace
              </Text>
            </View>
          </View>
        </View>

        {/* Menu Options */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuEmoji}>📊</Text>
            <Text style={styles.menuText}>My Progress</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuEmoji}>💭</Text>
            <Text style={styles.menuText}>Journal Entries</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.navigate("/step1")}>
            <Text>Onboarding</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuEmoji}>🎯</Text>
            <Text style={styles.menuText}>Goals & Reminders</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={handleSettings}
          >
            <Text style={styles.menuEmoji}>⚙️</Text>
            <Text style={styles.menuText}>Settings</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuEmoji}>💬</Text>
            <Text style={styles.menuText}>Help & Support</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={[
            styles.logoutButton,
            isLoggingOut && styles.logoutButtonDisabled,
          ]}
          onPress={handleLogout}
          activeOpacity={0.8}
          disabled={isLoggingOut}
        >
          <Text style={styles.logoutText}>
            {isLoggingOut ? "Signing Out..." : "Sign Out"}
          </Text>
        </TouchableOpacity>

        {/* Bottom padding for tabs */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.title,
    flex: 1,
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  editText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  profileSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  avatarContainer: {
    marginBottom: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  avatarText: {
    fontSize: 50,
  },
  userName: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.title,
    marginBottom: 8,
  },
  userEmail: {
    fontSize: 16,
    color: COLORS.subtitle,
    marginBottom: 4,
  },
  joinDate: {
    fontSize: 14,
    color: COLORS.subtitle,
    opacity: 0.8,
  },
  statsSection: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 24,
    marginBottom: 30,
  },
  statCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 6,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.subtitle,
    fontWeight: "500",
  },
  activitySection: {
    paddingHorizontal: 24,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.title,
    marginBottom: 16,
  },
  activityCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  activityEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.title,
    marginBottom: 4,
  },
  activityDescription: {
    fontSize: 14,
    color: COLORS.subtitle,
    opacity: 0.8,
  },
  menuSection: {
    paddingHorizontal: 24,
    marginBottom: 30,
  },
  menuItem: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  menuEmoji: {
    fontSize: 24,
    marginRight: 16,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.title,
  },
  menuArrow: {
    fontSize: 18,
    color: COLORS.subtitle,
    opacity: 0.6,
  },
  logoutButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 16,
    marginHorizontal: 24,
    alignItems: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  logoutButtonDisabled: {
    backgroundColor: COLORS.subtitle,
    shadowOpacity: 0.1,
  },
  logoutText: {
    color: COLORS.buttonText,
    fontSize: 16,
    fontWeight: "600",
  },
  bottomPadding: {
    height: 100,
  },
});
