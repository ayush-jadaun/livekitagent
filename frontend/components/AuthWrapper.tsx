// components/AuthWrapper.tsx
import { useEffect, useState } from "react";
import { useRouter, useSegments } from "expo-router";
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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Small delay to ensure navigation is ready
    const timer = setTimeout(() => {
      setIsNavigationReady(true);
    }, 100);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (loading || !isNavigationReady || onboardingComplete === null) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";

    // If onboarding is not complete
    if (!onboardingComplete) {
      // Only redirect to onboarding if user is not already in onboarding group
      if (!inOnboardingGroup) {
        router.replace("/(onboarding)/step1");
      }
      return;
    }

    // If onboarding is complete, handle authentication
    if (onboardingComplete) {
      if (!session && !inAuthGroup) {
        // User is not authenticated and not in auth group
        router.replace("/(auth)/login");
      } else if (session && inAuthGroup) {
        // User is authenticated but in auth group
        router.replace("/(tabs)");
      }
    }
  }, [session, segments, loading, isNavigationReady, onboardingComplete]);

  return <>{children}</>;
}
