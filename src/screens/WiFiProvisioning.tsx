// Onboarding: WiFi Provisioning — SSID/password (optional); then go to main app
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "../ThemeProvider";

export default function WiFiProvisioning() {
  const { theme } = useTheme();
  const router = useRouter();
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    setLoading(true);
    try {
      // TODO: send WiFi credentials to device over BLE if needed; for now just go to main app
      router.replace("/(tabs)/dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.inner}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.textDark }]}>WiFi Setup</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Connect your harness to your home WiFi (optional). You can configure this later in Settings.
          </Text>
          <Text style={[styles.label, { color: theme.textMuted }]}>Network name (SSID)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
            placeholder="Your WiFi name"
            placeholderTextColor={theme.textMuted}
            value={ssid}
            onChangeText={setSsid}
            autoCapitalize="none"
          />
          <Text style={[styles.label, { color: theme.textMuted }]}>Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
            placeholder="Optional"
            placeholderTextColor={theme.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <TouchableOpacity
            onPress={handleFinish}
            disabled={loading}
            style={[styles.btn, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}
          >
            <Text style={styles.btnText}>Finish & go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  content: { padding: 24 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 24 },
  label: { fontSize: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16 },
  btn: { padding: 16, borderRadius: 12, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
