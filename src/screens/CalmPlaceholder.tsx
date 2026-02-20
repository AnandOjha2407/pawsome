// src/screens/CalmPlaceholder.tsx — Calm Now screen per v1 guide
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
import { MaterialIcons } from "@expo/vector-icons";
import { useFirebase } from "../context/FirebaseContext";
import { PROTOCOLS } from "../firebase/firebase";
import { bleManager, THERAPY } from "../ble/BLEManager";

const DURATIONS = [30, 60, 90, 120];

export default function CalmPlaceholder() {
  const { theme } = useTheme();
  const firebase = useFirebase();
  const [protocol, setProtocol] = useState(1);
  const [intensity, setIntensity] = useState(3);
  const [duration, setDuration] = useState(60);
  const [sending, setSending] = useState(false);
  const [sendingStop, setSendingStop] = useState(false);

  const deviceId = firebase?.deviceId;
  const vestConnected = (bleManager as any)?.getConnections?.()?.connected?.vest ?? false;

  /** Map app protocol 1–8 to BLE therapy codes (0x00–0x0D) */
  const protocolToBLECode = (p: number): number => {
    const map: Record<number, number> = {
      1: THERAPY.CALM,       // Heartbeat Rhythm
      2: THERAPY.CALM,       // Breathing Pulse
      3: THERAPY.MASSAGE,    // Spine Wave
      4: THERAPY.CALM,       // Comfort Hold
      5: THERAPY.CALM,       // Anxiety Wrap
      6: THERAPY.CALM,       // Progressive Calm
      7: THERAPY.CALM,       // Focus Pattern
      8: THERAPY.SLEEP,      // Sleep Inducer
    };
    return map[p] ?? THERAPY.CALM;
  };

  const handleStart = async () => {
    setSending(true);
    try {
      if (deviceId && firebase?.sendCalm) {
        const id = await firebase.sendCalm(protocol, intensity, duration);
        if (id) Alert.alert("Sent", "Calm command sent to harness via Firebase.");
        else Alert.alert("Error", "Failed to send command.");
      } else if (vestConnected && typeof (bleManager as any).sendTherapyCommand === "function") {
        const code = protocolToBLECode(protocol);
        const intensityByte = Math.round((intensity / 5) * 255);
        await (bleManager as any).setVestIntensity?.(intensityByte);
        const ok = await (bleManager as any).sendTherapyCommand(code);
        if (ok) Alert.alert("Sent", "Calm signal sent via BLE (protocol & intensity).");
        else Alert.alert("Error", "Failed to send.");
      } else {
        Alert.alert("Not Connected", "Pair harness (BLE) or set Device ID in Settings.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  const handleEmergencyStop = async () => {
    setSendingStop(true);
    try {
      if (deviceId && firebase?.sendStop) {
        const id = await firebase.sendStop();
        if (id) Alert.alert("Sent", "Emergency stop sent.");
        else Alert.alert("Error", "Failed to send stop.");
      } else if (vestConnected && typeof (bleManager as any).sendTherapyCommand === "function") {
        const ok = await (bleManager as any).sendTherapyCommand(THERAPY.STOP);
        if (ok) Alert.alert("Sent", "Therapy stopped.");
        else Alert.alert("Error", "Failed to stop.");
      } else {
        Alert.alert("Not Connected", "Connect a device first.");
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

        {/* Protocol selector */}
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
                style={[
                  styles.protocolNum,
                  { color: protocol === p.id ? "#000" : theme.textMuted },
                ]}
              >
                {p.id}
              </Text>
              <Text
                style={[
                  styles.protocolName,
                  { color: protocol === p.id ? "#000" : theme.textDark },
                ]}
                numberOfLines={2}
              >
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Intensity */}
        <Text style={[styles.sectionLabel, { color: theme.textDark, marginTop: 20 }]}>
          Intensity (1–5)
        </Text>
        <View style={styles.intensityRow}>
          {[1, 2, 3, 4, 5].map((i) => (
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
              <Text
                style={{
                  fontWeight: "800",
                  color: intensity === i ? "#000" : theme.textDark,
                }}
              >
                {i}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Duration */}
        <Text style={[styles.sectionLabel, { color: theme.textDark, marginTop: 20 }]}>
          Duration (seconds)
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
              <Text
                style={{
                  fontWeight: "700",
                  color: duration === d ? "#000" : theme.textDark,
                }}
              >
                {d}s
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Start button */}
        <TouchableOpacity
          onPress={handleStart}
          disabled={sending}
          style={[
            styles.startBtn,
            { backgroundColor: theme.primary, opacity: sending ? 0.6 : 1 },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <MaterialIcons name="play-arrow" size={24} color="#000" />
              <Text style={[styles.startBtnText, { color: "#000" }]}>Start</Text>
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
  intensityRow: { flexDirection: "row", gap: 10 },
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
});
