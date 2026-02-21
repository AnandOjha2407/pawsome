import Pairing from "../../src/screens/Pairing";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../src/ThemeProvider";

export default function OnboardingPairScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Pairing />
      <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: theme.primary }]}
          onPress={() => router.replace("/(onboarding)/wifi")}
        >
          <Text style={styles.continueBtnText}>Continue to WiFi setup</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: 0.5,
    padding: 16,
    paddingBottom: 24,
  },
  continueBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  continueBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
