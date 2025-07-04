import React, { useEffect } from "react";
import { Stack, router, usePathname } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function RootLayout() {
  const pathname = usePathname();

  useEffect(() => {
    const checkOnboarding = async () => {
      const onboardingComplete = await AsyncStorage.getItem(
        "onboarding_complete"
      );
      if (onboardingComplete !== "true" && !pathname.startsWith("/step")) {
        router.replace("/step1");
      }
    };
    checkOnboarding();
  }, [pathname]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
