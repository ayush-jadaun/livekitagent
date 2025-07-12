// app/_layout.tsx
import React from "react";
import { Stack } from "expo-router";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import AuthWrapper from "@/components/AuthWrapper";

export default function RootLayout() {
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
