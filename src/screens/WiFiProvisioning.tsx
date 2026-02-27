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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "../ThemeProvider";
import { useFirebase } from "../context/FirebaseContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadPairedDevices } from "../storage/pairedDevices";
import { ONBOARDING_COMPLETE_KEY } from "../storage/constants";

export default function WiFiProvisioning() {
  const { theme } = useTheme();
  const router = useRouter();
  const firebase = useFirebase();
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    setLoading(true);
    try {
      const paired = await loadPairedDevices().catch(() => ({}));
      const deviceId = paired?.vest?.id ?? null;
      if (firebase?.setDeviceId) {
        await firebase.setDeviceId(deviceId);
      }
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
      router.replace("/dashboard" as any);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not continue.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkipToDashboard = async () => {
    setLoading(true);
    try {
      if (firebase?.setDeviceId) await firebase.setDeviceId(null);
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
      router.replace("/dashboard" as any);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not continue.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToConnection = () => router.replace("/pair" as any);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.inner}>
        <View style={styles.content}>
          <TouchableOpacity onPress={handleBackToConnection} style={styles.backBtn}>
            <Text style={[styles.backBtnText, { color: theme.primary }]}>← Back to connection (Bluetooth)</Text>
          </TouchableOpacity>
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
          <TouchableOpacity
            onPress={handleSkipToDashboard}
            disabled={loading}
            style={[styles.btn, styles.btnSecondary, { borderColor: theme.border, backgroundColor: theme.card }]}
          >
            <Text style={[styles.btnTextSecondary, { color: theme.textDark }]}>Skip to Dashboard</Text>
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
  backBtn: { marginBottom: 12, paddingVertical: 4 },
  backBtnText: { fontSize: 16, fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 24 },
  label: { fontSize: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16 },
  btn: { padding: 16, borderRadius: 12, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnSecondary: { borderWidth: 1 },
  btnTextSecondary: { fontSize: 16, fontWeight: "600" },
});
