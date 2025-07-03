import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";

// Warm anger-focused color palette
const COLORS = {
  background: "#FFF8F0", // warm cream/beige
  card: "#FFFCF7", // warm white with slight cream tint
  primary: "#E53E3E", // strong red
  secondary: "#FF6B6B", // coral red
  tertiary: "#FFEBE6", // warm light peach
  accent: "#F56565", // lighter red
  buttonText: "#FFFFFF",
  title: "#2D3748", // dark gray
  subtitle: "#4A5568", // medium gray
  shadow: "#FFB3B3",
  inactive: "#A0AEC0", // gray for inactive tabs
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopWidth: 1,
          borderTopColor: COLORS.tertiary,
          height: 90,
          paddingBottom: 25,
          paddingTop: 12,
          shadowColor: COLORS.shadow,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 10,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
              <Text style={[styles.iconText, { color }]}>🏠</Text>
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
              <Text style={[styles.iconText, { color }]}>👤</Text>
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 2,
  },
  tabIconActive: {
    backgroundColor: COLORS.tertiary,
  },
  iconText: {
    fontSize: 20,
  },
});
