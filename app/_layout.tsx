import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../src/ThemeProvider";
import { useEffect } from "react";
import { Platform, AppState } from "react-native";
import * as SystemUI from "expo-system-ui";

export default function RootLayout() {
  useEffect(() => {
    // Hide system navigation bar on Android using immersive mode
    const hideNavigationBar = async () => {
      if (Platform.OS === "android") {
        try {
          // Set navigation bar to transparent and immersive
          await SystemUI.setBackgroundColorAsync("transparent");
        } catch (error) {
          console.warn("Failed to set system UI:", error);
        }
      }
    };

    hideNavigationBar();

    // Re-hide navigation bar when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && Platform.OS === "android") {
        hideNavigationBar();
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}