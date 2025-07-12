import React from "react";
import { Stack } from "expo-router";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import AuthWrapper from "@/components/AuthWrapper";
import { useDeepLinks } from "@/hooks/useDeepLink";

export default function RootLayout() {
  useDeepLinks(); // Initialize deep link handling

  return (
    <OnboardingProvider>
      <AuthWrapper>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
        </Stack>
      </AuthWrapper>
    </OnboardingProvider>
  );
}
