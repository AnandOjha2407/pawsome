// src/hooks/usePageOnboarding.ts
// Hook to manage per-page onboarding state

import { useState, useEffect } from "react";
import {
  isPageOnboardingComplete,
  setPageOnboardingComplete,
  PageOnboardingKey,
} from "../storage/onboarding";

export function usePageOnboarding(page: PageOnboardingKey) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, [page]);

  const checkOnboardingStatus = async () => {
    try {
      const completed = await isPageOnboardingComplete(page);
      setShowOnboarding(!completed);
      setIsLoading(false);
    } catch (error) {
      console.warn("Failed to check page onboarding status", error);
      setIsLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      await setPageOnboardingComplete(page, true);
      setShowOnboarding(false);
    } catch (error) {
      console.warn("Failed to save page onboarding status", error);
    }
  };

  return {
    showOnboarding,
    isLoading,
    completeOnboarding,
  };
}
