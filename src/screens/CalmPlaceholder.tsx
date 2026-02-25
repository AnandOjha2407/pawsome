// Calm Now: Pipe 2 writes to RTDB commands/latest; Pipe 3 feedback via liveState.therapyActive
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

const STATUS_TIMEOUT_MS = 10000;

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
  const [waitingForDevice, setWaitingForDevice] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deviceId = firebase?.deviceId;
  const liveState = firebase?.liveState ?? null;
  const therapyActive = (liveState?.therapyActive ?? "NONE").trim() || "NONE";
  const isTherapyRunning = therapyActive !== "NONE";
  const vestConnected = (bleManager as any)?.getConnections?.()?.connected?.vest ?? false;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Pipe 3: when we're waiting for device and therapyActive becomes non-NONE, stop waiting
  useEffect(() => {
    if (waitingForDevice && isTherapyRunning) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setSending(false);
      setWaitingForDevice(false);
    }
  }, [waitingForDevice, isTherapyRunning]);

  /** Map app protocol 1–8 to BLE therapy codes (fallback when no Device ID) */
  const protocolToBLECode = (p: number): number => {
    const map: Record<number, number> = {
      1: THERAPY.CALM, 2: THERAPY.CALM, 3: THERAPY.MASSAGE, 4: THERAPY.CALM,
      5: THERAPY.CALM, 6: THERAPY.CALM, 7: THERAPY.CALM, 8: THERAPY.SLEEP,
    };
    return map[p] ?? THERAPY.CALM;
  };

  const handleStart = async () => {
    if (!deviceId || !firebase?.sendCalm) {
      if (vestConnected && typeof (bleManager as any).sendTherapyCommand === "function") {
        setSending(true);
        try {
          const code = protocolToBLECode(protocol);
          const intensityByte = Math.round((intensity / 5) * 255);
          await (bleManager as any).setVestIntensity?.(intensityByte);
          const ok = await (bleManager as any).sendTherapyCommand(code);
          if (ok) Alert.alert("Sent", "Calm signal sent via BLE.");
          else Alert.alert("Error", "Failed to send.");
        } catch (e: any) {
          Alert.alert("Error", e?.message ?? "Failed to send.");
        } finally {
          setSending(false);
        }
      } else {
        Alert.alert("Set Device ID", "Set Device ID in Settings to send therapy to the harness.");
      }
      return;
    }

    setSending(true);
    setWaitingForDevice(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    try {
      const result = await firebase.sendCalm(protocol, intensity, duration);
      if (!result) {
        Alert.alert("Error", "Failed to send command.");
        setSending(false);
        setWaitingForDevice(false);
        return;
      }

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setSending(false);
        setWaitingForDevice(false);
        Alert.alert("Timeout", "No response from device in 10 seconds. Check connection and Device ID.");
      }, STATUS_TIMEOUT_MS);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to send.");
      setSending(false);
      setWaitingForDevice(false);
    }
  };

  const handleEmergencyStop = async () => {
    setSendingStop(true);
    try {
      if (deviceId && firebase?.sendStop) {
        const id = await firebase.sendStop();
        if (id) {
          // Optional: could watch for therapyActive clear like Dashboard
        } else {
          Alert.alert("Error", "Failed to send stop.");
        }
      } else if (vestConnected && typeof (bleManager as any).sendTherapyCommand === "function") {
        await (bleManager as any).sendTherapyCommand(THERAPY.STOP);
      } else {
        Alert.alert("Set Device ID", "Set Device ID in Settings for remote control.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed.");
    } finally {
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
              <Text style={[styles.protocolNum, { color: protocol === p.id ? "#000" : theme.textMuted }]}>
                {p.id}
              </Text>
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
        <View style={styles.intensityRow}>
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
        </View>

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

        {/* Pipe 3: status from therapyActive. Show Start when none active, Stop when running. */}
        {isTherapyRunning ? (
          <View style={[styles.therapyStatusCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.therapyStatusLabel, { color: theme.textMuted }]}>{therapyDisplayName(therapyActive)} running</Text>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={handleStart}
          disabled={sending || isTherapyRunning}
          style={[styles.startBtn, { backgroundColor: theme.primary, opacity: sending || isTherapyRunning ? 0.6 : 1 }]}
        >
          {sending ? (
            <View style={styles.sendingWrap}>
              <ActivityIndicator size="small" color="#000" />
              <Text style={[styles.statusText, { color: theme.textDark }]}>
                Sending… waiting for device (check therapy status in ~5s)
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
  intensityRow: { flexDirection: "row", gap: 10 },
  intensityLabel: { fontSize: 10, marginTop: 2 },
  intensityBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
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
