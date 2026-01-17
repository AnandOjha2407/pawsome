// src/storage/onboarding.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_COMPLETE_KEY = "@onboarding_complete_v1";
const PAGE_ONBOARDING_KEY = "@page_onboarding_v1";

export type PageOnboardingKey = "home" | "dashboard" | "bondai" | "settings";

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return value === "true";
  } catch (e) {
    console.warn("[onboarding] failed to read onboarding status", e);
    return false;
  }
}

export async function setOnboardingComplete(complete: boolean = true): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, complete ? "true" : "false");
  } catch (e) {
    console.warn("[onboarding] failed to save onboarding status", e);
  }
}

export async function resetOnboarding(): Promise<void> {
  await setOnboardingComplete(false);
}

// Per-page onboarding functions
export async function isPageOnboardingComplete(page: PageOnboardingKey): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(PAGE_ONBOARDING_KEY);
    if (!value) return false;
    const pages = JSON.parse(value);
    // Safety check: ensure pages is an object
    if (pages && typeof pages === "object") {
      return pages[page] === true;
    }
    return false;
  } catch (e) {
    console.warn("[onboarding] failed to read page onboarding status", e);
    return false;
  }
}

export async function setPageOnboardingComplete(
  page: PageOnboardingKey,
  complete: boolean = true
): Promise<void> {
  try {
    const value = await AsyncStorage.getItem(PAGE_ONBOARDING_KEY);
    let pages: Record<string, boolean> = {};
    if (value) {
      try {
        const parsed = JSON.parse(value);
        // Safety check: ensure parsed is an object
        if (parsed && typeof parsed === "object") {
          pages = parsed;
        }
      } catch (parseError) {
        // If JSON is corrupted, start fresh
        console.warn("[onboarding] corrupted JSON, starting fresh", parseError);
        pages = {};
      }
    }
    pages[page] = complete;
    await AsyncStorage.setItem(PAGE_ONBOARDING_KEY, JSON.stringify(pages));
  } catch (e) {
    console.warn("[onboarding] failed to save page onboarding status", e);
  }
}

