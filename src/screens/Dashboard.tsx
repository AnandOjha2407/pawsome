// Dashboard — Pipe 1: READ only from /devices/{deviceId}/live. All fields use ?? for future-proofing.
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFirebase } from "../context/FirebaseContext";
import { THERAPY_ACTIVE_DISPLAY } from "../firebase/firebase";
import { bleManager } from "../ble/BLEManager";

// State emoji/icon and glow per spec 5.2 — all from device state
const STATE_EMOJI: Record<string, string> = {
  SLEEPING: "🌙",  // Moon / sleeping face
  CALM: "😌",      // Relaxed smile
  ALERT: "👀",     // Eyes / surprised
  ANXIOUS: "😟",   // Worried face
  ACTIVE: "🏃",    // Running / playing
};

// Glow colors per spec (opacity in hex: 10%=1A, 15%=26, 20%=33)
const STATE_GLOW: Record<string, string> = {
  SLEEPING: "#58A6FF1A", // Dim blue 10%
  CALM: "#3FB95026",     // Soft green 15%
  ALERT: "#D2992233",    // Amber 20%
  ANXIOUS: "#A855F733",  // Pulsing purple 20% (animated below)
  ACTIVE: "#F0883E33",   // Orange 20%
};

function anxietyBarColor(score: number): string {
  if (score <= 33) return "#3FB950";
  if (score <= 66) return "#D29922";
  return "#F85149";
}

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
        if (id) {
          // Loading stays true until device acknowledges (therapyActive clears) or timeout — see useEffect below
        } else {
          Alert.alert("Error", "Failed to send stop command.");
          setSendingStop(false);
        }
      } else if (vestConnected && typeof (bleManager as any).sendTherapyCommand === "function") {
        const { THERAPY } = await import("../ble/BLEManager");
        const ok = await (bleManager as any).sendTherapyCommand(THERAPY.STOP);
        if (ok) setSendingStop(false);
        else {
          Alert.alert("Error", "Failed to stop.");
          setSendingStop(false);
        }
      } else {
        Alert.alert("Not Connected", "Set Device ID in Settings for live control (BLE is setup-only).");
        setSendingStop(false);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to send stop.");
      setSendingStop(false);
    }
  };

  const state = (live?.state ?? "CALM") as keyof typeof STATE_EMOJI;
  const emoji = STATE_EMOJI[state] ?? "😌";
  const glowColor = STATE_GLOW[state] ?? theme.primary + "26";
  // Handout: device lastUpdated is "seconds since boot". We show time since app last received data.
  const receivedAt = firebase?.liveReceivedAt ?? null;
  const lastUpdated = receivedAt != null
    ? `${Math.max(0, Math.round((Date.now() - receivedAt) / 1000))}s ago`
    : "—";
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isAnxious = state === "ANXIOUS";
  const therapyActive = !!(live?.therapyActive && live.therapyActive !== "NONE" && live.therapyActive !== "");

  // Refresh "Xs ago" every second while we have live data
  const [, setTick] = useState(0);
  useEffect(() => {
    if (receivedAt == null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [receivedAt]);

  // Emergency Stop: loading until device acknowledges (therapyActive → none) or 8s timeout
  useEffect(() => {
    if (!sendingStop) return;
    if (!therapyActive) {
      setSendingStop(false);
      return;
    }
    const t = setTimeout(() => setSendingStop(false), 8000);
    return () => clearTimeout(t);
  }, [sendingStop, therapyActive]);

  useEffect(() => {
    if (!isAnxious) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.92, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isAnxious, pulseAnim]);

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

  // All displayed values from device via Pipe 1; ?? so missing fields never crash
  const anxietyScore = live?.anxietyScore ?? 0;
  const activityLevel = Math.min(10, Math.max(0, live?.activityLevel ?? 0));
  const breathingRate = live?.breathingRate;
  const circuitTemp = live?.circuitTemp;
  const confidence = live?.confidence ?? 0;
  const batteryPercent = live?.batteryPercent ?? 0;
  const connectionType = live?.connectionType ?? "wifi";
  const therapyActiveRaw = (live?.therapyActive ?? "NONE").trim() || "NONE";
  const therapyStatusText = THERAPY_ACTIVE_DISPLAY[therapyActiveRaw]?.name ?? (therapyActiveRaw !== "NONE" ? therapyActiveRaw : "None active");

  const formatTemp = (v: number | undefined | null): string =>
    v != null && typeof v === "number" ? `${Number(v).toFixed(1)}` : "--";
  const formatBpm = (v: number | undefined | null): string =>
    v != null && typeof v === "number" ? `${Math.round(v)}` : "--";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header: [Dog Name] [Battery] [Signal] — wireframe 5.2 */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.textDark }]} numberOfLines={1}>
            {/* Dog name from profile when available; else default */}
            My Dog
          </Text>
          <View style={styles.headerRight}>
            <View style={[styles.badge, { backgroundColor: theme.card }]}>
              <Text style={{ fontSize: 12, color: theme.textMuted }}>🔋 {typeof batteryPercent === "number" ? `${batteryPercent}%` : "--"}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: theme.card }]}>
              <Text style={{ fontSize: 12, color: theme.textMuted }}>
                {connectionType === "wifi" ? "📶 WiFi" : connectionType === "ble" ? "📶 BLE" : "📶 --"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/settings")} style={{ padding: 8 }}>
              <MaterialIcons name="settings" size={24} color={theme.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Big emoji for state + state name + confidence — all from device */}
        <View style={[styles.stateCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {isAnxious ? (
            <Animated.View style={[styles.stateEmojiWrap, { transform: [{ scale: pulseAnim }] }]}>
              <View style={[styles.glowCircle, { backgroundColor: glowColor }]} />
              <Text style={styles.stateEmoji}>{emoji}</Text>
            </Animated.View>
          ) : (
            <View style={styles.stateEmojiWrap}>
              <View style={[styles.glowCircle, { backgroundColor: glowColor }]} />
              <Text style={styles.stateEmoji}>{emoji}</Text>
            </View>
          )}
          <Text style={[styles.stateLabel, { color: theme.textDark }]}>{state}</Text>
          <Text style={[styles.confidence, { color: theme.textMuted }]}>
            Confidence: {confidence != null ? `${confidence}%` : "--"}
          </Text>
        </View>

        {/* Anxiety Score & Activity Level — device data */}
        <View style={styles.row}>
          <View style={[styles.gaugeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.gaugeLabel, { color: theme.textMuted }]}>Anxiety Score</Text>
            <View style={[styles.barBg, { backgroundColor: theme.background }]}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(100, anxietyScore)}%`, backgroundColor: anxietyBarColor(anxietyScore) },
                ]}
              />
            </View>
            <Text style={[styles.gaugeValue, { color: theme.textDark }]}>{anxietyScore}/100</Text>
          </View>
          <View style={[styles.gaugeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.gaugeLabel, { color: theme.textMuted }]}>Activity Level</Text>
            <View style={[styles.barBg, { backgroundColor: theme.background }]}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(100, (activityLevel / 10) * 100)}%`, backgroundColor: theme.secondary },
                ]}
              />
            </View>
            <Text style={[styles.gaugeValue, { color: theme.textDark }]}>{activityLevel}/10</Text>
          </View>
        </View>

        {/* Breathing Rate & Circuit Temp — device data */}
        <View style={[styles.metricsRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Breathing Rate</Text>
            <Text style={[styles.metricValue, { color: theme.textDark }]}>
              {formatBpm(breathingRate)} bpm
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Circuit Temp</Text>
            <Text style={[styles.metricValue, { color: theme.textDark }]}>
              {formatTemp(circuitTemp)} °C
            </Text>
          </View>
        </View>

        {/* Therapy Status — from device */}
        <View style={[styles.therapyRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.therapyLabel, { color: theme.textMuted }]}>Therapy Status:</Text>
          <Text style={[styles.therapyValue, { color: theme.textDark }]}>{therapyStatusText}</Text>
        </View>

        {/* CALM NOW | EMERGENCY STOP — red button always visible; loading until acknowledged */}
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

        {/* Calibration — from device when present */}
        {(live?.calibrationDay != null || live?.calibrationComplete) && (
          <View style={[styles.calibrationRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.therapyLabel, { color: theme.textMuted }]}>Calibration:</Text>
            <Text style={[styles.therapyValue, { color: theme.textDark }]}>
              {live?.calibrationComplete ? "Complete" : `Day ${live?.calibrationDay ?? 0} of 5`}
            </Text>
          </View>
        )}

        {/* Connection: WiFi | Last update — from device */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textMuted }]}>
            Connection: {live ? (connectionType === "wifi" ? "WiFi" : connectionType.toUpperCase()) : "—"} | Last update: {lastUpdated}
          </Text>
        </View>

        {/* BLE is setup-only: prompt to set Device ID or pair for first-time setup */}
        {!deviceId && !vestConnected && (
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={[styles.pairBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <MaterialCommunityIcons name="wifi" size={20} color={theme.primary} />
            <Text style={[styles.pairBtnText, { color: theme.primary }]}>Set Device ID in Settings for live data (BLE is setup-only)</Text>
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
  stateEmojiWrap: { alignItems: "center", justifyContent: "center", marginBottom: 8 },
  glowCircle: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  stateEmoji: { fontSize: 64 },
  stateLabel: { fontSize: 24, fontWeight: "800" },
  confidence: { fontSize: 14, marginTop: 6 },
  calibrationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
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
