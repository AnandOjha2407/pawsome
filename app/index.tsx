import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useFirebase } from "../src/context/FirebaseContext";

/** Gate: redirect to Auth stack, Onboarding stack, or Main tabs based on auth + device. */
export default function Index() {
  const firebase = useFirebase();

  if (firebase?.authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00F0FF" />
      </View>
    );
  }

  if (!firebase?.user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!firebase?.deviceId) {
    return <Redirect href="/(onboarding)/dog-profile" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D1117",
  },
});
