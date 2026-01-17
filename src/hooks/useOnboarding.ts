// src/hooks/useOnboarding.ts
// Hook to manage onboarding state

import { useState, useEffect } from "react";
import { isOnboardingComplete, setOnboardingComplete } from "../storage/onboarding";

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const completed = await isOnboardingComplete();
      setShowOnboarding(!completed);
      setIsLoading(false);
    } catch (error) {
      console.warn("Failed to check onboarding status", error);
      setIsLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      await setOnboardingComplete(true);
      setShowOnboarding(false);
    } catch (error) {
      console.warn("Failed to save onboarding status", error);
    }
  };

  const resetOnboarding = async () => {
    try {
      await setOnboardingComplete(false);
      setShowOnboarding(true);
    } catch (error) {
      console.warn("Failed to reset onboarding", error);
    }
  };

  return {
    showOnboarding,
    isLoading,
    completeOnboarding,
    resetOnboarding,
  };
}

