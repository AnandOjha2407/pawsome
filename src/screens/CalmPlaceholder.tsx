// Calm Now: sends therapy via BLE (primary) or Firebase (remote fallback).
// Confirmation is from BLE beb54841 STATUS — NOT Firebase therapyActive.
import React, { useState, useEffect, useRef } from "react";
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
import { MaterialIcons } from "@expo/vector-icons";
import { useFirebase } from "../context/FirebaseContext";
import { PROTOCOLS, THERAPY_ACTIVE_DISPLAY } from "../firebase/firebase";
import { bleManager, THERAPY } from "../ble/BLEManager";

const DURATIONS = [30, 60, 90, 120] as const;
const INTENSITY_LABELS: Record<number, string> = {
  1: "Gentle",
  2: "Light",
  3: "Medium",
  4: "Strong",
  5: "Max",
};

function therapyDisplayName(therapyActive: string): string {
  const entry = THERAPY_ACTIVE_DISPLAY[therapyActive];
  return entry?.name ?? (therapyActive && therapyActive !== "NONE" ? therapyActive : "None active");
}

export default function CalmPlaceholder() {
  const { theme } = useTheme();
  const firebase = useFirebase();
  const [protocol, setProtocol] = useState(1);
  const [intensity, setIntensity] = useState(3);
  const [duration, setDuration] = useState(60);
  const [sending, setSending] = useState(false);
  const [sendingStop, setSendingStop] = useState(false);
  const [bleTherapyRunning, setBleTherapyRunning] = useState(false);
  const [cooldownSecs, setCooldownSecs] = useState(0);

  const deviceId = firebase?.deviceId;
  const liveState = firebase?.liveState ?? null;
  const firebaseTherapy = (liveState?.therapyActive ?? "NONE").trim() || "NONE";
  const vestConnected = bleManager?.getConnections?.()?.connected?.vest ?? false;
  const isTherapyRunning = bleTherapyRunning || firebaseTherapy !== "NONE";

  // Listen to BLE STATUS characteristic (beb54841) for instant therapy confirmation
  useEffect(() => {
    const onStatus = (evt: { status: string; cooldownSecs?: number }) => {
      if (evt.status === "running") {
        setBleTherapyRunning(true);
        setSending(false);
        setCooldownSecs(0);
      } else if (evt.status === "stopped") {
        setBleTherapyRunning(false);
        setSendingStop(false);
        setCooldownSecs(0);
      } else if (evt.status === "cooldown") {
        setBleTherapyRunning(false);
        setSending(false);
        setCooldownSecs(evt.cooldownSecs ?? 0);
      }
    };
    bleManager.on("therapy_confirmed", onStatus);
    return () => { bleManager.off("therapy_confirmed", onStatus); };
  }, []);

  // Tick down cooldown timer
  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const id = setInterval(() => setCooldownSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownSecs > 0]);

  const handleStart = async () => {
    setSending(true);

    // Primary path: send via BLE when harness is connected
    if (vestConnected) {
      try {
        const ok = await bleManager.sendCalmBLE(protocol, intensity, duration);
        if (!ok) {
          Alert.alert("Error", "Failed to send command to harness.");
          setSending(false);
        }
        // Confirmation will arrive via therapy_confirmed event → setSending(false)
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to send.");
        setSending(false);
      }
      // Also write to Firebase for history logging (fire-and-forget)
      if (deviceId && firebase?.sendCalm) {
        firebase.sendCalm(protocol, intensity, duration).catch(() => {});
      }
      return;
    }

    // Fallback: send via Firebase when BLE not connected (owner away)
    if (deviceId && firebase?.sendCalm) {
      try {
        const result = await firebase.sendCalm(protocol, intensity, duration);
        if (!result) {
          Alert.alert("Error", "Failed to send command.");
        }
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to send.");
      } finally {
        setSending(false);
      }
      return;
    }

    Alert.alert("Not Connected", "Connect to harness via BLE or set Device ID in Settings.");
    setSending(false);
  };

  const handleEmergencyStop = async () => {
    setSendingStop(true);
    try {
      // BLE path first (instant)
      if (vestConnected) {
        const ok = await bleManager.sendStopBLE();
        if (!ok) Alert.alert("Error", "Failed to send stop.");
        // Confirmation via therapy_confirmed → setSendingStop(false)
      }
      // Also send via Firebase
      if (deviceId && firebase?.sendStop) {
        await firebase.sendStop();
      }
      if (!vestConnected && !deviceId) {
        Alert.alert("Not Connected", "No BLE or cloud connection available.");
        setSendingStop(false);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed.");
      setSendingStop(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.textDark }]}>Calm Now</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>
          Select a therapy protocol and send to your dog's harness
        </Text>

        {/* Protocol selector: 8 therapy modes (grid) — 5.3 */}
        <Text style={[styles.sectionLabel, { color: theme.textDark }]}>Protocol</Text>
        <View style={styles.protocolGrid}>
          {PROTOCOLS.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setProtocol(p.id)}
              style={[
                styles.protocolBtn,
                {
                  backgroundColor: protocol === p.id ? theme.primary : theme.card,
                  borderColor: protocol === p.id ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                style={[styles.protocolName, { color: protocol === p.id ? "#000" : theme.textDark }]}
                numberOfLines={1}
              >
                {p.name}
              </Text>
              <Text
                style={[styles.protocolDesc, { color: protocol === p.id ? "rgba(0,0,0,0.7)" : theme.textMuted }]}
                numberOfLines={2}
              >
                {p.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Intensity slider: 1–5 (1=Gentle, 5=Max) — 5.3 */}
        <Text style={[styles.sectionLabel, { color: theme.textDark, marginTop: 20 }]}>
          Intensity
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.intensityRow}
        >
          {([1, 2, 3, 4, 5] as const).map((i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setIntensity(i)}
              style={[
                styles.intensityBtn,
                {
                  backgroundColor: intensity === i ? theme.primary : theme.card,
                  borderColor: intensity === i ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={{ fontWeight: "800", color: intensity === i ? "#000" : theme.textDark }}>{i}</Text>
              <Text style={[styles.intensityLabel, { color: intensity === i ? "#000" : theme.textMuted }]}>
                {INTENSITY_LABELS[i]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Duration picker: 30s, 60s, 90s, 120s — 5.3 */}
        <Text style={[styles.sectionLabel, { color: theme.textDark, marginTop: 20 }]}>
          Duration
        </Text>
        <View style={styles.durationRow}>
          {DURATIONS.map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setDuration(d)}
              style={[
                styles.durationBtn,
                {
                  backgroundColor: duration === d ? theme.primary : theme.card,
                  borderColor: duration === d ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={{ fontWeight: "700", color: duration === d ? "#000" : theme.textDark }}>{d}s</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isTherapyRunning ? (
          <View style={[styles.therapyStatusCard, { backgroundColor: theme.card, borderColor: "#3FB950" }]}>
            <Text style={[styles.therapyStatusLabel, { color: "#3FB950" }]}>
              {bleTherapyRunning ? "Therapy running (confirmed by harness)" : therapyDisplayName(firebaseTherapy) + " running"}
            </Text>
          </View>
        ) : null}
        {cooldownSecs > 0 ? (
          <View style={[styles.therapyStatusCard, { backgroundColor: theme.card, borderColor: "#D29922" }]}>
            <Text style={[styles.therapyStatusLabel, { color: "#D29922" }]}>
              Cooldown active — try again in {cooldownSecs}s
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={handleStart}
          disabled={sending || isTherapyRunning || cooldownSecs > 0}
          style={[styles.startBtn, { backgroundColor: theme.primary, opacity: sending || isTherapyRunning || cooldownSecs > 0 ? 0.6 : 1 }]}
        >
          {sending ? (
            <View style={styles.sendingWrap}>
              <ActivityIndicator size="small" color="#000" />
              <Text style={[styles.statusText, { color: theme.textDark }]}>
                Sending to harness…
              </Text>
            </View>
          ) : (
            <>
              <MaterialIcons name="play-arrow" size={24} color="#000" />
              <Text style={[styles.startBtnText, { color: "#000" }]}>{isTherapyRunning ? "Therapy active" : "Start"}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Emergency Stop */}
        <TouchableOpacity
          onPress={handleEmergencyStop}
          disabled={sendingStop}
          style={[
            styles.stopBtn,
            { backgroundColor: "#F85149", opacity: sendingStop ? 0.6 : 1 },
          ]}
        >
          {sendingStop ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="stop" size={24} color="#fff" />
              <Text style={[styles.stopBtnText, { color: "#fff" }]}>EMERGENCY STOP</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 24 },
  sectionLabel: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  protocolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  protocolBtn: {
    width: "48%",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  protocolNum: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  protocolName: { fontSize: 13, fontWeight: "600" },
  protocolDesc: { fontSize: 11, marginTop: 4, opacity: 0.9 },
  intensityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  intensityLabel: { fontSize: 11, marginTop: 2 },
  intensityBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  durationRow: { flexDirection: "row", gap: 10 },
  durationBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  startBtnText: { fontSize: 18, fontWeight: "800" },
  sendingWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusText: { fontSize: 14, fontWeight: "600" },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  stopBtnText: { fontSize: 16, fontWeight: "800" },
  therapyStatusCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  therapyStatusLabel: { fontSize: 14, fontWeight: "600" },
});
