// src/screens/Dashboard.tsx — Live Dashboard per v1 guide
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFirebase } from "../context/FirebaseContext";
import { bleManager } from "../ble/BLEManager";

const STATE_EMOJI: Record<string, string> = {
  SLEEPING: "🌙",
  CALM: "😌",
  ALERT: "👀",
  ANXIOUS: "😟",
  ACTIVE: "🏃",
};

const STATE_COLORS: Record<string, string> = {
  SLEEPING: "#58A6FF",
  CALM: "#3FB950",
  ALERT: "#D29922",
  ANXIOUS: "#A855F7",
  ACTIVE: "#F0883E",
};

export default function Dashboard() {
  const { theme } = useTheme();
  const router = useRouter();
  const firebase = useFirebase();
  const [sendingStop, setSendingStop] = useState(false);

  const live = firebase?.liveState ?? null;
  const deviceId = firebase?.deviceId;
  const loading = firebase?.loading ?? false;
  const vestConnected = (bleManager as any)?.getConnections?.()?.connected?.vest ?? false;

  const handleCalmNow = () => router.push("/calm" as any);
  const handleEmergencyStop = async () => {
    setSendingStop(true);
    try {
      if (deviceId && firebase?.sendStop) {
        const id = await firebase.sendStop();
        if (id) Alert.alert("Sent", "Emergency stop command sent.");
        else Alert.alert("Error", "Failed to send stop command.");
      } else if (vestConnected && typeof (bleManager as any).sendTherapyCommand === "function") {
        const { THERAPY } = await import("../ble/BLEManager");
        const ok = await (bleManager as any).sendTherapyCommand(THERAPY.STOP);
        if (ok) Alert.alert("Sent", "Therapy stopped via BLE.");
        else Alert.alert("Error", "Failed to stop.");
      } else {
        Alert.alert("Not Connected", "Connect a device or set Device ID in Settings.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to send stop.");
    } finally {
      setSendingStop(false);
    }
  };

  const state = live?.state ?? "CALM";
  const emoji = STATE_EMOJI[state] ?? "😌";
  const stateColor = STATE_COLORS[state] ?? theme.primary;
  const lastUpdated = live?.lastUpdated
    ? `${Math.round((Date.now() / 1000 - live.lastUpdated))}s ago`
    : "—";

  if (loading && !live) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.subtitle, { color: theme.textMuted, marginTop: 12 }]}>Connecting...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.textDark }]}>Live Dashboard</Text>
          <View style={styles.headerRight}>
            <View style={[styles.badge, { backgroundColor: theme.card }]}>
              <Text style={{ fontSize: 12, color: theme.textMuted }}>🔋 {live?.batteryPercent ?? "--"}%</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/settings")} style={{ padding: 8 }}>
              <MaterialIcons name="settings" size={24} color={theme.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Big state display */}
        <View style={[styles.stateCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.stateEmoji, { opacity: 0.9 }]}>{emoji}</Text>
          <Text style={[styles.stateLabel, { color: theme.textDark }]}>{state}</Text>
          <Text style={[styles.confidence, { color: theme.textMuted }]}>
            Confidence: {live?.confidence ?? "--"}%
          </Text>
        </View>

        {/* Anxiety & Activity */}
        <View style={styles.row}>
          <View style={[styles.gaugeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.gaugeLabel, { color: theme.textMuted }]}>Anxiety Score</Text>
            <View style={[styles.barBg, { backgroundColor: theme.card }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(100, live?.anxietyScore ?? 0)}%`,
                    backgroundColor: (live?.anxietyScore ?? 0) > 60 ? "#F85149" : theme.primary,
                  },
                ]}
              />
            </View>
            <Text style={[styles.gaugeValue, { color: theme.textDark }]}>
              {live?.anxietyScore ?? 0}/100
            </Text>
          </View>
          <View style={[styles.gaugeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.gaugeLabel, { color: theme.textMuted }]}>Activity Level</Text>
            <View style={[styles.barBg, { backgroundColor: theme.card }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${((live?.activityLevel ?? 0) / 10) * 100}%`,
                    backgroundColor: theme.secondary,
                  },
                ]}
              />
            </View>
            <Text style={[styles.gaugeValue, { color: theme.textDark }]}>
              {live?.activityLevel ?? 0}/10
            </Text>
          </View>
        </View>

        {/* Breathing & Temp */}
        <View style={[styles.metricsRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Breathing Rate</Text>
            <Text style={[styles.metricValue, { color: theme.textDark }]}>
              {live?.breathingRate ?? "--"} bpm
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Circuit Temp</Text>
            <Text style={[styles.metricValue, { color: theme.textDark }]}>
              {live?.circuitTemp ?? "--"} °C
            </Text>
          </View>
        </View>

        {/* Therapy status */}
        <View style={[styles.therapyRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.therapyLabel, { color: theme.textMuted }]}>Therapy Status:</Text>
          <Text style={[styles.therapyValue, { color: theme.textDark }]}>
            {live?.therapyActive && live.therapyActive !== "NONE" ? live.therapyActive : "None active"}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={handleCalmNow}
            style={[styles.calmBtn, { backgroundColor: theme.primary }]}
          >
            <MaterialIcons name="favorite" size={20} color="#000" />
            <Text style={[styles.calmBtnText, { color: "#000" }]}>CALM NOW</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleEmergencyStop}
            disabled={sendingStop}
            style={[styles.stopBtn, { backgroundColor: "#F85149", opacity: sendingStop ? 0.6 : 1 }]}
          >
            {sendingStop ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="stop" size={20} color="#fff" />
                <Text style={[styles.stopBtnText, { color: "#fff" }]}>EMERGENCY STOP</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Connection footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textMuted }]}>
            Connection: {live ? (live.connectionType ?? "wifi") : "—"} | Last update: {lastUpdated}
          </Text>
        </View>

        {/* Pair / Set device ID */}
        {!deviceId && !vestConnected && (
          <TouchableOpacity
            onPress={() => router.push("/pairing")}
            style={[styles.pairBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <MaterialCommunityIcons name="bluetooth" size={20} color={theme.primary} />
            <Text style={[styles.pairBtnText, { color: theme.primary }]}>Pair harness (BLE) or set Device ID in Settings</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: "800" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  stateCard: {
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: 20,
  },
  stateEmoji: { fontSize: 64, marginBottom: 8 },
  stateLabel: { fontSize: 24, fontWeight: "800" },
  confidence: { fontSize: 14, marginTop: 6 },
  row: { flexDirection: "row", gap: 12, marginBottom: 16 },
  gaugeCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  gaugeLabel: { fontSize: 12, marginBottom: 8 },
  barBg: { height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  barFill: { height: "100%", borderRadius: 4 },
  gaugeValue: { fontSize: 18, fontWeight: "800" },
  metricsRow: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  metric: { flex: 1 },
  metricLabel: { fontSize: 12 },
  metricValue: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  therapyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  therapyLabel: { fontSize: 14 },
  therapyValue: { fontSize: 14, fontWeight: "700" },
  actions: { gap: 12 },
  calmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
  },
  calmBtnText: { fontSize: 16, fontWeight: "800" },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
  },
  stopBtnText: { fontSize: 16, fontWeight: "800" },
  footer: { marginTop: 20, alignItems: "center" },
  footerText: { fontSize: 12 },
  subtitle: { fontSize: 14 },
  pairBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 24,
  },
  pairBtnText: { fontSize: 14, fontWeight: "600" },
});
