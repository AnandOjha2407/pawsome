import Login from "../../src/screens/Login";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useFirebase } from "../../src/context/FirebaseContext";
import { useTheme } from "../../src/ThemeProvider";
import auth from "@react-native-firebase/auth";

export default function AuthLoginScreen() {
  const router = useRouter();
  const firebase = useFirebase();
  const { theme } = useTheme();

  useEffect(() => {
    if (firebase?.user) {
      router.replace("/");
    }
  }, [firebase?.user]);

  const handleSkip = async () => {
    try {
      await auth().signInAnonymously();
    } catch (e: any) {
      console.warn("Skip login failed", e?.message);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Login
        onSignUp={() => router.push("/signup" as any)}
      />
      <TouchableOpacity
        onPress={handleSkip}
        style={[styles.skipBtn, { borderColor: theme.border }]}
      >
        <Text style={[styles.skipText, { color: theme.textMuted }]}>Skip login (for testing)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  skipBtn: {
    position: "absolute",
    bottom: 32,
    left: 24,
    right: 24,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  skipText: { fontSize: 14, fontWeight: "600" },
});
