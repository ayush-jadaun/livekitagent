import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Linking
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { User } from "@supabase/supabase-js";

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

interface UserProfile {
  id: string;
  name: string;
  email: string;
  age?: number;
  created_at: string;
  updated_at: string;
}

interface UserStats {
  totalSessions: number;
  currentStreak: number;
  totalMinutes: number;
  favoriteActivity: string;
}

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userStats, setUserStats] = useState<UserStats>({
    totalSessions: 0,
    currentStreak: 0,
    totalMinutes: 0,
    favoriteActivity: "Meditation (Coming soon)",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setIsLoading(true);

      // Get current user session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Session error:", sessionError);
        router.navigate("/(auth)/login");
        return;
      }

      if (!session?.user) {
        console.log("No user session found");
        router.navigate("/login");
        return;
      }

      setUser(session.user);

      // Fetch user profile from your backend or database
      await fetchUserProfile(session.user.id, session.access_token);

      // Fetch user statistics
      await fetchUserStats(session.user.id, session.access_token);
    } catch (error) {
      console.error("Error loading user data:", error);
      Alert.alert("Error", "Failed to load profile data");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string, accessToken: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching user profile:", error);
        return;
      }

      if (data) {
        setUserProfile(data);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const fetchUserStats = async (userId: string, accessToken: string) => {
    try {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("sessions")
        .select("*")
        .eq("user_id", userId);

      if (sessionsError) {
        console.error("Error fetching sessions:", sessionsError);
      } else if (sessionsData) {
        const totalSessions = sessionsData.length;
        const totalMinutes = sessionsData.reduce((sum, session) => {
          return sum + (session.duration_minutes || 0);
        }, 0);

        const currentStreak = calculateStreak(sessionsData);

        setUserStats({
          totalSessions,
          currentStreak,
          totalMinutes,
          favoriteActivity: "Meditation (Coming soon )",
        });
      }
    } catch (error) {
      console.error("Error fetching user stats:", error);
    }
  };

  const calculateStreak = (sessions: any[]) => {
    if (!sessions.length) return 0;

    // Sort sessions by date (most recent first)
    const sortedSessions = sessions.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (const session of sortedSessions) {
      const sessionDate = new Date(session.created_at);
      sessionDate.setHours(0, 0, 0, 0);

      const daysDiff = Math.floor(
        (currentDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === streak) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserData();
    setRefreshing(false);
  };

  const handleEditProfile = () => {
    // Navigate to edit profile screen
    router.push("/profile/edit");
  };

  const handleSettings = () => {
    // Navigate to settings screen
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
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
              Alert.alert("Error", "Failed to logout. Please try again.");
              console.error("Logout error:", error);
            } else {
              // Successfully signed out
              router.replace("/(auth)/login");
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

  const formatJoinDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  };

  const handleForm= ()=>{
    Linking.openURL("https://forms.gle/iT9s9ivSbDs6MDuX7");

  }

  const getUserDisplayName = () => {
    if (userProfile?.name) {
      return userProfile.name;
    }
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return "User";
  };

  const getUserEmail = () => {
    return user?.email || "No email";
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.errorText}>Unable to load profile</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadUserData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Use SafeAreaView for header to ensure it's below the camera/notch */}
      <View style={styles.safeHeader}>
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
      </View>
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Profile Picture and Info */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getUserDisplayName().charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.userName}>{getUserDisplayName()}</Text>
          <Text style={styles.userEmail}>{getUserEmail()}</Text>
          {userProfile?.age && (
            <Text style={styles.userAge}>Age: {userProfile.age}</Text>
          )}
          <Text style={styles.joinDate}>
            Member since{" "}
            {formatJoinDate(userProfile?.created_at || user.created_at)}
          </Text>
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{userStats.totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{userStats.currentStreak}</Text>
            <Text style={styles.statLabel}>Day Streak(Coming soon)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{userStats.totalMinutes}</Text>
            <Text style={styles.statLabel}>Minutes     (Coming soon)</Text>
          </View>
        </View>
        {/* Favorite Activity */}
        <View style={styles.activitySection}>
          <Text style={styles.sectionTitle}>Favorite Activity</Text>
          <View style={styles.activityCard}>
            <Text style={styles.activityEmoji}>🧘‍♂️</Text>
            <View style={styles.activityInfo}>
              <Text style={styles.activityName}>
                {userStats.favoriteActivity}
              </Text>
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
            <Text style={styles.menuText}>My Progress (Coming soon)</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <Text style={styles.menuEmoji}>💭</Text>
            <Text style={styles.menuText}>Journal Entries(Coming soon)</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>

          {/* <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => router.push("/step1")}
          >
            <Text style={styles.menuEmoji}>🎯</Text>
            <Text style={styles.menuText}>Onboarding</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity> */}

{/* 
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={handleSettings}
          >
            <Text style={styles.menuEmoji}>⚙️</Text>
            <Text style={styles.menuText}>Settings</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity> */}

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={handleForm}>
            <Text style={styles.menuEmoji}>💬</Text>
            <Text style={styles.menuText}>Feedback form!</Text>
            <Text style={styles.menuArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* User ID for debugging (remove in production) */}
        {/* {__DEV__ && (
          <View style={styles.debugSection}>
            <Text style={styles.debugText}>User ID: {user.id}</Text>
          </View>
        )} */}

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
            {isLoggingOut ? "Loging Out..." : "Log Out"}
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
  safeHeader: {
    // This ensures header starts below the notch/camera on all devices
    paddingTop: Platform.OS === "android" ? 24 : 0,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.subtitle,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.accent,
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: COLORS.buttonText,
    fontSize: 16,
    fontWeight: "600",
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
    fontWeight: "bold",
    color: COLORS.buttonText,
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
  userAge: {
    fontSize: 14,
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
  debugSection: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  debugText: {
    fontSize: 12,
    color: COLORS.subtitle,
    fontFamily: "monospace",
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
