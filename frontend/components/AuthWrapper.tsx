// components/AuthWrapper.tsx
import { useEffect, useState } from "react";
import { useRouter, useSegments } from "expo-router";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import { Session } from "@supabase/supabase-js";
import { useOnboarding } from "@/contexts/OnboardingContext";

export default function AuthWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const { onboardingComplete } = useOnboarding();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Error getting session:", error);
        }

        if (mounted) {
          setSession(session);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to initialize auth:", error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.id);

      if (mounted) {
        setSession(session);
      }
    });

    // App state change handler
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        console.log("App became active, refreshing session...");
        // Refresh session when app becomes active
        supabase.auth.getSession().then(({ data: { session } }) => {
          console.log("Session check on app active:", !!session);
          if (mounted) {
            setSession(session);
          }
        });
      }
    };

    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // Navigation ready timer
    const timer = setTimeout(() => {
      if (mounted) {
        setIsNavigationReady(true);
      }
    }, 100);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      appStateSubscription?.remove();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (loading || !isNavigationReady || onboardingComplete === null) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";

    console.log("Navigation logic:", {
      onboardingComplete,
      hasSession: !!session,
      currentSegment: segments[0],
      inAuthGroup,
      inOnboardingGroup,
    });

    if (!onboardingComplete) {
      if (!inOnboardingGroup) {
        router.replace("/(onboarding)/step1");
      }
      return;
    }

    if (onboardingComplete) {
      if (!session && !inAuthGroup) {
        router.replace("/(auth)/login");
      } else if (session && inAuthGroup) {
        router.replace("/(tabs)");
      }
    }
  }, [session, segments, loading, isNavigationReady, onboardingComplete]);

  return <>{children}</>;
}
