// WiFi Provisioning: writes {ssid, password} to beb54843, listens for SUCCESS/FAILED on beb54841
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "../ThemeProvider";
import { useFirebase } from "../context/FirebaseContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadPairedDevices } from "../storage/pairedDevices";
import { ONBOARDING_COMPLETE_KEY } from "../storage/constants";
import { bleManager } from "../ble/BLEManager";
import { MaterialIcons } from "@expo/vector-icons";

type ProvisionState = "idle" | "sending" | "success" | "failed";

export default function WiFiProvisioning() {
  const { theme } = useTheme();
  const router = useRouter();
  const firebase = useFirebase();
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<ProvisionState>("idle");
  const [loading, setLoading] = useState(false);

  const vestConnected = bleManager?.getConnections?.()?.connected?.vest ?? false;

  useEffect(() => {
    const onResult = (evt: { success: boolean }) => {
      if (evt.success) {
        setState("success");
      } else {
        setState("failed");
      }
    };
    bleManager.on("wifi_provision_result", onResult);
    return () => { bleManager.off("wifi_provision_result", onResult); };
  }, []);

  const handleProvision = async () => {
    if (!ssid.trim()) {
      Alert.alert("WiFi Name Required", "Enter your home WiFi network name.");
      return;
    }
    if (!vestConnected) {
      Alert.alert("Not Connected", "Go back and connect to the harness via Bluetooth first.");
      return;
    }

    setState("sending");
    try {
      const ok = await bleManager.writeWifiCredentials(ssid.trim(), password);
      if (!ok) {
        setState("failed");
        Alert.alert("Error", "Failed to send WiFi credentials to harness.");
      }
      // Wait for SUCCESS/FAILED from beb54841 via wifi_provision_result event
    } catch (e: any) {
      setState("failed");
      Alert.alert("Error", e?.message ?? "Failed to send WiFi credentials.");
    }
  };

  const handleContinueToDashboard = async () => {
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

  const handleSkip = async () => {
    setLoading(true);
    try {
      const paired = await loadPairedDevices().catch(() => ({}));
      const deviceId = paired?.vest?.id ?? null;
      if (firebase?.setDeviceId) await firebase.setDeviceId(deviceId);
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
      router.replace("/dashboard" as any);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not continue.");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setState("idle");
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.inner}>
        <View style={styles.content}>
          <TouchableOpacity onPress={() => router.replace("/pair" as any)} style={styles.backBtn}>
            <Text style={[styles.backBtnText, { color: theme.primary }]}>{"← Back to pairing"}</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: theme.textDark }]}>WiFi Setup</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Connect your harness to home WiFi so it can send data when you're away. This only happens once.
          </Text>

          {!vestConnected && (
            <View style={[styles.warningCard, { backgroundColor: "#D2992220", borderColor: "#D29922" }]}>
              <Text style={[styles.warningText, { color: "#D29922" }]}>
                Harness not connected via Bluetooth. Go back and connect first.
              </Text>
            </View>
          )}

          {state === "success" ? (
            <View style={styles.resultContainer}>
              <MaterialIcons name="check-circle" size={80} color="#3FB950" />
              <Text style={[styles.resultTitle, { color: "#3FB950" }]}>WiFi Connected!</Text>
              <Text style={[styles.resultSubtitle, { color: theme.textMuted }]}>
                Your harness is now connected to "{ssid}" and can send data even when you're away.
              </Text>
              <TouchableOpacity
                onPress={handleContinueToDashboard}
                disabled={loading}
                style={[styles.btn, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}
              >
                <Text style={styles.btnText}>{loading ? "Setting up…" : "Go to Dashboard"}</Text>
              </TouchableOpacity>
            </View>
          ) : state === "failed" ? (
            <View style={styles.resultContainer}>
              <MaterialIcons name="error" size={80} color="#F85149" />
              <Text style={[styles.resultTitle, { color: "#F85149" }]}>Connection Failed</Text>
              <Text style={[styles.resultSubtitle, { color: theme.textMuted }]}>
                The harness could not connect to "{ssid}". Check the WiFi name and password and try again.
              </Text>
              <TouchableOpacity
                onPress={handleRetry}
                style={[styles.btn, { backgroundColor: theme.primary }]}
              >
                <Text style={styles.btnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.label, { color: theme.textMuted }]}>WiFi Network Name (SSID)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
                placeholder="e.g. HomeNetwork"
                placeholderTextColor={theme.textMuted}
                value={ssid}
                onChangeText={setSsid}
                autoCapitalize="none"
                editable={state !== "sending"}
              />
              <Text style={[styles.label, { color: theme.textMuted }]}>Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
                placeholder="WiFi password"
                placeholderTextColor={theme.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                editable={state !== "sending"}
              />
              <TouchableOpacity
                onPress={handleProvision}
                disabled={state === "sending" || !vestConnected}
                style={[styles.btn, { backgroundColor: theme.primary, opacity: state === "sending" || !vestConnected ? 0.6 : 1 }]}
              >
                {state === "sending" ? (
                  <View style={styles.sendingRow}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={[styles.btnText, { marginLeft: 10 }]}>Sending to harness…</Text>
                  </View>
                ) : (
                  <Text style={styles.btnText}>Connect WiFi</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSkip}
                disabled={loading || state === "sending"}
                style={[styles.btn, styles.btnSecondary, { borderColor: theme.border, backgroundColor: theme.card }]}
              >
                <Text style={[styles.btnTextSecondary, { color: theme.textDark }]}>Skip for now</Text>
              </TouchableOpacity>
            </>
          )}
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
  subtitle: { fontSize: 14, marginBottom: 24, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16 },
  btn: { padding: 16, borderRadius: 12, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnSecondary: { borderWidth: 1 },
  btnTextSecondary: { fontSize: 16, fontWeight: "600" },
  warningCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
  warningText: { fontSize: 14, fontWeight: "600" },
  resultContainer: { alignItems: "center", paddingTop: 40 },
  resultTitle: { fontSize: 22, fontWeight: "800", marginTop: 16 },
  resultSubtitle: { fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 32, lineHeight: 20, paddingHorizontal: 20 },
  sendingRow: { flexDirection: "row", alignItems: "center" },
});
