import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFirebase } from "../src/context/FirebaseContext";
import { ONBOARDING_COMPLETE_KEY } from "../src/storage/constants";

const GUEST_MODE_KEY = "@pawsomebond_guest_mode";

/** Gate: redirect to Auth, Onboarding, Guest, or Dashboard. */
export default function Index() {
  const firebase = useFirebase();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [isGuest, setIsGuest] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
      AsyncStorage.getItem(GUEST_MODE_KEY),
    ]).then(([onb, guest]) => {
      setOnboardingComplete(onb === "true");
      setIsGuest(guest === "true");
    });
  }, []);

  if (firebase == null || firebase.authLoading || onboardingComplete === null || isGuest === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00F0FF" />
      </View>
    );
  }

  if (!firebase.user) {
    return <Redirect href={"/login" as any} />;
  }

  // Anonymous user with guest flag → guest dashboard
  if (firebase.user.isAnonymous && isGuest) {
    return <Redirect href={"/guest" as any} />;
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
