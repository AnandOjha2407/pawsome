import { Tabs } from "expo-router";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../src/ThemeProvider";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import { useFirebase } from "../../src/context/FirebaseContext";
import { getFcmToken, saveFcmToken, setupFcmNotificationOpenHandler } from "../../src/firebase/firebase";
import messaging from "@react-native-firebase/messaging";

const NOTIFICATION_ASKED_KEY = "@pawsomebond_notification_asked_v1";

function FcmSetup() {
  const firebase = useFirebase();
  const router = useRouter();
  const askedRef = useRef(false);

  useEffect(() => {
    const uid = firebase?.user?.uid;
    if (!uid) return;

    const teardown = setupFcmNotificationOpenHandler((screen) => {
      if (screen === "dashboard") router.replace("/(tabs)/dashboard");
      else if (screen === "calm") router.replace("/(tabs)/calm");
    });

    (async () => {
      try {
        const alreadyAsked = await AsyncStorage.getItem(NOTIFICATION_ASKED_KEY);
        if (alreadyAsked === "true") {
          const token = await getFcmToken();
          if (token) await saveFcmToken(uid, token);
          return;
        }
        if (askedRef.current) return;
        askedRef.current = true;
        Alert.alert(
          "Enable Notifications",
          "Get alerts for anxiety spikes, therapy updates, low battery, and when your harness goes offline. Allow notifications?",
          [
            { text: "Not now", style: "cancel", onPress: () => AsyncStorage.setItem(NOTIFICATION_ASKED_KEY, "true") },
            {
              text: "Enable",
              onPress: async () => {
                await AsyncStorage.setItem(NOTIFICATION_ASKED_KEY, "true");
                const token = await getFcmToken();
                if (token) await saveFcmToken(uid, token);
              },
            },
          ],
          { cancelable: true }
        );
      } catch (e) {
        console.warn("[FcmSetup]", e);
      }
    })();

    const unsubTokenRefresh = messaging().onTokenRefresh(async (token: string) => {
      try {
        if (firebase?.user?.uid) await saveFcmToken(firebase.user.uid, token);
      } catch (err) {
        console.warn("[FcmSetup] onTokenRefresh save failed", err);
      }
    });

    return () => {
      teardown();
      unsubTokenRefresh();
    };
  }, [firebase?.user?.uid]);

  useEffect(() => {
    const uid = firebase?.user?.uid;
    if (!uid) return;
    getFcmToken()
      .then((token) => { if (token) return saveFcmToken(uid, token); })
      .catch(() => {});
  }, [firebase?.user?.uid]);

  return null;
}

export default function TabsLayout() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <>
      <FcmSetup />
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
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="paw" color={color} size={size} />
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
            <MaterialIcons name="show-chart" color={color} size={size} />
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
    </Tabs>
    </>
  );
}
