// contexts/OnboardingContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface OnboardingContextType {
  onboardingComplete: boolean | null;
  setOnboardingComplete: (complete: boolean) => void;
  markOnboardingComplete: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [onboardingComplete, setOnboardingCompleteState] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const onboardingStatus = await AsyncStorage.getItem(
          "onboarding_complete"
        );
        setOnboardingCompleteState(onboardingStatus === "true");
      } catch (error) {
        console.error("Error checking onboarding:", error);
        setOnboardingCompleteState(false);
      }
    };

    checkOnboarding();
  }, []);

  const setOnboardingComplete = (complete: boolean) => {
    setOnboardingCompleteState(complete);
  };

  const markOnboardingComplete = async () => {
    try {
      await AsyncStorage.setItem("onboarding_complete", "true");
      setOnboardingCompleteState(true);
    } catch (error) {
      console.error("Failed to set onboarding complete flag:", error);
    }
  };

  return (
    <OnboardingContext.Provider
      value={{
        onboardingComplete,
        setOnboardingComplete,
        markOnboardingComplete,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
};
