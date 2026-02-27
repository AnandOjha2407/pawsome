import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFirebase } from "../src/context/FirebaseContext";
import { ONBOARDING_COMPLETE_KEY } from "../src/storage/constants";

/** Gate: redirect to Auth, Onboarding, or Dashboard. No device = dashboard with "Set Device ID" (no mock). */
export default function Index() {
  const firebase = useFirebase();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then((v) => setOnboardingComplete(v === "true"));
  }, []);

  if (firebase == null || firebase.authLoading || onboardingComplete === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00F0FF" />
      </View>
    );
  }

  if (!firebase.user) {
    return <Redirect href={"/login" as any} />;
  }

  if (!firebase.deviceId && !onboardingComplete) {
    return <Redirect href={"/dog-profile" as any} />;
  }

  return <Redirect href={"/dashboard" as any} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D1117",
  },
});
