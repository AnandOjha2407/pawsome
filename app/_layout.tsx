import { Tabs } from "expo-router";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "../src/ThemeProvider";
import { FirebaseProvider } from "../src/context/FirebaseContext";
import { useEffect } from "react";
import { Platform, AppState } from "react-native";
import * as SystemUI from "expo-system-ui";
import { bleManager } from "../src/ble/BLEManager";
import { loadPairedDevices } from "../src/storage/pairedDevices";

function TabsNavigator() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          height: 64 + Math.max(insets.bottom, 0),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          backgroundColor: theme.card ?? "#fff",
          borderTopColor: theme.border ?? "#e5e7eb",
          borderTopWidth: 0.5,
          elevation: 0,
        },
        tabBarActiveTintColor: theme.primary ?? "#00c6dcff",
        tabBarInactiveTintColor: theme.textMuted ?? "#ffffffff",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="dashboard" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calm"
        options={{
          title: "Calm",
          tabBarLabel: "Calm",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="favorite" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarLabel: "History",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="history" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="settings" color={color} size={size} />
          ),
        }}
      />
      {/* Hidden: onboarding / WiFi provisioning (future) */}
      <Tabs.Screen
        name="pairing"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

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
    
    // Delay auto-connect to ensure BLE manager is fully initialized
    const autoConnectTimer = setTimeout(async () => {
      if (!mounted) return;
      
      try {
        // Check if auto-connect method exists
        if (bleManager && typeof (bleManager as any).autoConnectPairedDevices === "function") {
          console.log("[RootLayout] Starting auto-connect for paired devices...");
          await (bleManager as any).autoConnectPairedDevices();
        } else {
          console.warn("[RootLayout] Auto-connect method not available");
        }
      } catch (error: any) {
        console.warn("[RootLayout] Auto-connect error:", error?.message ?? error);
        // Non-critical - app can still work without auto-connect
      }
    }, 2000); // Wait 2 seconds for BLE manager to initialize

    // Also try auto-connect when app comes to foreground
    const appStateSubscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active" && mounted) {
        // Small delay to ensure BLE is ready
        setTimeout(async () => {
          if (!mounted) return;
          
          try {
            // Check if any devices disconnected and need reconnection
            const connections = (bleManager as any)?.getConnections?.();
            if (connections) {
              const paired = await loadPairedDevices();
              
              // Check if we have paired devices that aren't connected
              const needsReconnect = paired.vest && !connections.connected?.vest;
              
              if (needsReconnect && bleManager && typeof (bleManager as any).autoConnectPairedDevices === "function") {
                console.log("[RootLayout] App became active - checking for disconnected devices...");
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
            <TabsNavigator />
          </FirebaseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}