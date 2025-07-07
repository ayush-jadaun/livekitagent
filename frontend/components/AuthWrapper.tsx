// components/AuthWrapper.tsx
import { useEffect, useState } from "react";
import { useRouter, useSegments } from "expo-router";
import { supabase } from "../lib/supabase";
import { Session } from "@supabase/supabase-js";

export default function AuthWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNavigationReady, setIsNavigationReady] = useState(false);
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
    if (loading || !isNavigationReady) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!session && !inAuthGroup) {
      // User is not authenticated and not in auth group
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      // User is authenticated but in auth group
      router.replace("/(tabs)");
    }
  }, [session, segments, loading, isNavigationReady]);

  return <>{children}</>;
}
