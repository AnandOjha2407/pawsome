// Load Firebase app first so DEFAULT app exists before Auth/Database are used
import "@react-native-firebase/app";

import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "../src/ThemeProvider";
import { FirebaseProvider } from "../src/context/FirebaseContext";
import { useEffect } from "react";
import { Platform, AppState } from "react-native";
import * as SystemUI from "expo-system-ui";
import { bleManager } from "../src/ble/BLEManager";
import { loadPairedDevices } from "../src/storage/pairedDevices";

export default function RootLayout() {
  useEffect(() => {
    const hideNavigationBar = async () => {
      if (Platform.OS === "android") {
        try {
          await SystemUI.setBackgroundColorAsync("transparent");
        } catch (error) {
          console.warn("Failed to set system UI:", error);
        }
      }
    };

    hideNavigationBar();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && Platform.OS === "android") {
        hideNavigationBar();
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  // Auto-connect to paired devices on app start
  useEffect(() => {
    let mounted = true;

    const autoConnectTimer = setTimeout(async () => {
      if (!mounted) return;
      try {
        if (bleManager && typeof (bleManager as any).autoConnectPairedDevices === "function") {
          await (bleManager as any).autoConnectPairedDevices();
        }
      } catch (error: any) {
        console.warn("[RootLayout] Auto-connect error:", error?.message ?? error);
      }
    }, 2000);

    const appStateSubscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active" && mounted) {
        setTimeout(async () => {
          if (!mounted) return;
          try {
            const connections = (bleManager as any)?.getConnections?.();
            if (connections) {
              const paired = await loadPairedDevices();
              const needsReconnect = paired.vest && !connections.connected?.vest;
              if (needsReconnect && bleManager && typeof (bleManager as any).autoConnectPairedDevices === "function") {
                await (bleManager as any).autoConnectPairedDevices();
              }
            }
          } catch (error: any) {
            console.warn("[RootLayout] Foreground auto-connect error:", error?.message ?? error);
          }
        }, 1000);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(autoConnectTimer);
      appStateSubscription?.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <FirebaseProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </FirebaseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
