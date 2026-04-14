import Login from "../../src/screens/Login";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useFirebase } from "../../src/context/FirebaseContext";
import auth from "@react-native-firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GUEST_MODE_KEY = "@pawsomebond_guest_mode";

export default function AuthLoginScreen() {
  const router = useRouter();
  const firebase = useFirebase();
  const [guestLoading, setGuestLoading] = useState(false);

  useEffect(() => {
    if (firebase?.user) {
      router.replace("/");
    }
  }, [firebase?.user]);

  const handleGuestMode = async () => {
    setGuestLoading(true);
    try {
      await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
      await auth().signInAnonymously();
    } catch (e: any) {
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      const msg = e?.message ?? "Unknown error";
      Alert.alert(
        "Guest Login Failed",
        `Could not sign in as guest.\n\n${msg}\n\nMake sure Anonymous sign-in is enabled in Firebase Console → Authentication → Sign-in method.`
      );
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <Login
      onSignUp={() => router.push("/signup" as any)}
      onGuestMode={handleGuestMode}
      guestLoading={guestLoading}
    />
  );
}
