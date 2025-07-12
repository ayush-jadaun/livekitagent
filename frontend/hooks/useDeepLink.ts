import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

export const useDeepLinks = () => {
  const router = useRouter();

  useEffect(() => {
    const handleDeepLink = (url: string) => {
      console.log("Deep link received:", url);

      // Normalize the URL - handle both :// and :# formats
      let normalizedUrl = url;
      if (url.includes("exp+rasmlai:#")) {
        normalizedUrl = url.replace("exp+rasmlai:#", "exp+rasmlai://auth?");
      } else if (url.includes("rasmlai:#")) {
        normalizedUrl = url.replace("rasmlai:#", "rasmlai://auth?");
      } else if (url.includes("frontend:#")) {
        normalizedUrl = url.replace("frontend:#", "frontend://auth?");
      }

      console.log("Normalized URL:", normalizedUrl);

      // Check if URL matches our expected schemes
      const isValidScheme =
        normalizedUrl.startsWith("rasmlai://") ||
        normalizedUrl.startsWith("exp+rasmlai://") ||
        normalizedUrl.startsWith("frontend://");

      if (!isValidScheme) {
        console.log("Invalid scheme, ignoring deep link");
        return;
      }

      try {
        const parsed = Linking.parse(normalizedUrl);
        const { hostname, path, queryParams } = parsed;

        console.log("Parsed URL:", { hostname, path, queryParams });

        // Convert queryParams to string values only
        const stringParams: Record<string, string> = {};
        if (queryParams) {
          Object.entries(queryParams).forEach(([key, value]) => {
            if (typeof value === "string") {
              stringParams[key] = value;
            } else if (Array.isArray(value) && value.length > 0) {
              stringParams[key] = String(value[0]);
            } else if (value != null) {
              stringParams[key] = String(value);
            }
          });
        }

        // Handle auth-related deep links (including errors)
        if (
          hostname === "auth" ||
          path?.includes("auth") ||
          queryParams?.error ||
          queryParams?.access_token
        ) {
          // Handle auth errors
          if (queryParams?.error) {
            console.log("Auth error received:", {
              error: queryParams.error,
              error_code: queryParams.error_code,
              error_description: queryParams.error_description,
            });

            // Navigate to error screen or login with error params
            router.push({
              pathname: "/(auth)/login",
              params: stringParams,
            });
            return;
          }

          // Handle successful auth
          if (Object.keys(stringParams).length > 0) {
            
          } else {
            router.push("/(auth)/login");
          }
        }  else if (hostname === "tabs" || path?.includes("tabs")) {
          if (Object.keys(stringParams).length > 0) {
            router.push({
              pathname: "/(tabs)",
              params: stringParams,
            });
          } else {
            router.push("/(tabs)");
          }
        } else {
          // Default fallback
          if (Object.keys(stringParams).length > 0) {
            router.push({
              pathname: "/",
              params: stringParams,
            });
          } else {
            router.push("/");
          }
        }
      } catch (error) {
        console.error("Error parsing deep link:", error);
      }
    };

    // Handle app launch via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        setTimeout(() => handleDeepLink(url), 1000);
      }
    });

    // Handle deep links while app is running
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => subscription?.remove();
  }, [router]);
};
