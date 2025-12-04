// src/screens/Dashboard.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Pressable,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { bleManager } from "../ble/BLEManager";
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";

type Props = { navigation?: any };
const screenW = Dimensions.get("window").width;

/* Layout-focused styles. Colors are applied inline from active theme */
const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 18 },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  title: { fontSize: 26, fontWeight: "800" },
  subtitle: { marginTop: 4, fontSize: 13 },

  topControlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  leftControls: { flexDirection: "row", alignItems: "center", gap: 12 },

  profilePickerRow: { flexDirection: "row", alignItems: "center", gap: 12 },

  connectBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
  },

  /* Top live area */
  topRow: { flexDirection: "row", gap: 14, marginBottom: 18 },
  largeCard: {
    flex: 1,
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  statCard: {
    width: screenW * 0.36,
    borderRadius: 12,
    padding: 14,
    justifyContent: "center",
  },

  cardTitle: { fontSize: 13, fontWeight: "700" },
  hrText: { fontSize: 28, fontWeight: "800" },
  smallLabel: { fontSize: 12 },

  heartWrap: {
    width: 88,
    height: 88,
    borderRadius: 88,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  stackedRow: { flexDirection: "column", gap: 12, marginBottom: 18 },

  cardLargeGraph: {
    borderRadius: 14,
    padding: 16,
    // backgroundColor applied inline via theme
  },

  sectionLabel: { fontWeight: "800", marginBottom: 8, fontSize: 16 },
});

/* small animated pressable */
function AnimatedPressable({ onPress, children, style }: { onPress?: () => void; children: React.ReactNode; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      style={({ pressed }) => [{ opacity: pressed ? 0.96 : 1 }]}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/* Small 7-day bar chart (re-usable) */
function SevenDayBarChart({
  data,
  colors,
  height = 72,
  labelColor,
}: {
  data: number[];
  colors: string[];
  height?: number;
  labelColor: string;
}) {
  const max = Math.max(...(data ?? []), 1);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height }}>
      {data.map((v, i) => {
        const barH = Math.max(6, Math.round((v / max) * (height - 12)));
        return (
          <View key={i} style={{ flex: 1, alignItems: "center", marginHorizontal: 6 }}>
            <LinearGradient
              colors={colors as any}
              start={{ x: 0, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={{ width: 14, height: barH, borderRadius: 6 }}
            />
            <Text style={{ fontSize: 11, color: labelColor, marginTop: 8 }}>{["S", "M", "T", "W", "T", "F", "S"][i]}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* Single Dashboard component */
export default function Dashboard({ navigation }: Props) {
  const { theme } = useTheme();
  // dog data only (local UI state)
  const [dogData, setDogData] = useState({
    heartRate: 68,
    steps: 820,
    battery: 85,
    spO2: 0,
    respiratoryRate: 24,
    hr7: [70, 72, 71, 73, 69, 68, 68],
    steps7: [800, 1200, 600, 4200, 1500, 3200, 820],
    restMinutes: 480,
    napDuration: 30,
    activityLevel: "medium" as "low" | "medium" | "high",
    harnessContact: true,
  });

  // only dog connection (boolean)
  const [dogConnected, setDogConnected] = useState(false);

  const [assignedDeviceName, setAssignedDeviceName] = useState<string | null>(null);
  const [rssi, setRssi] = useState<number | null>(null);
  const [firmwareVersion, setFirmwareVersion] = useState<string | null>(null);
  const [isTraining, setIsTraining] = useState(false);

  // heart pulse animation
  const heartPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heartPulse, { toValue: 1.12, duration: 650, useNativeDriver: true }),
        Animated.timing(heartPulse, { toValue: 1.0, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [heartPulse]);

  // BLE listeners (update dog fields when provided)
  useEffect(() => {
    const onData = (data: any) => {
      if (!data) return;

      if (typeof data.rssi === "number") setRssi(data.rssi);
      if (data.firmwareVersion) setFirmwareVersion(data.firmwareVersion);

      // Only update if this is dog profile data
      if (data.profile === "dog" || !data.profile) {
        setDogData((prev) => ({
          ...prev,
          heartRate: typeof data.heartRate === "number" ? data.heartRate : prev.heartRate,
          steps: typeof data.steps === "number" ? data.steps : prev.steps,
          battery: typeof data.battery === "number" ? data.battery : prev.battery,
          spO2: typeof data.spO2 === "number" ? data.spO2 : prev.spO2,
          respiratoryRate: typeof data.respiratoryRate === "number" ? data.respiratoryRate : prev.respiratoryRate,
          hr7: Array.isArray(data.hrHistory) ? data.hrHistory : prev.hr7,
          steps7: Array.isArray(data.stepsHistory) ? data.stepsHistory : prev.steps7,
          restMinutes: typeof data.restTime === "number" ? data.restTime : prev.restMinutes,
          napDuration: typeof data.napDuration === "number" ? data.napDuration : prev.napDuration,
          activityLevel: data.activityLevel ?? prev.activityLevel,
          harnessContact: typeof data.harnessContact === "boolean" ? data.harnessContact : prev.harnessContact,
        }));
      }

      console.log("BLE data event:", data);
    };

    try {
      (bleManager as any).on?.("data", onData);
    } catch (e) {
      console.warn("bleManager.on failed", e);
    }

    return () => {
      try {
        (bleManager as any).off?.("data", onData);
      } catch (e) {
        /* noop */
      }
    };
  }, []);

  // manage simple dog connection simulation
  useEffect(() => {
    console.log("Dog connection:", dogConnected, "bleState:", (bleManager as any).getState?.());

    if (!dogConnected) {
      (bleManager as any).stopSimulation?.();
      (bleManager as any).disconnect?.();
      return;
    }

    if (!(bleManager as any).isConnected) {
      (bleManager as any).connect?.();
    }

    (bleManager as any).simulateData?.("dog");
    (bleManager as any).assignProfile?.("dog");
  }, [dogConnected]);

  const toggleDogConnection = () => {
    setDogConnected((s) => {
      const next = !s;
      console.log("dog connection ->", next ? "connecting" : "disconnecting");
      setTimeout(() => console.log("bleManager.getState ->", (bleManager as any).getState?.()), 50);
      return next;
    });
  };

  const assignConnectedToDog = () => {
    (bleManager as any).assignProfile?.("dog");
    setAssignedDeviceName("Assigned: My Dog");
    Alert.alert("Assigned", `Connected device assigned to your dog`);
  };

  const startTraining = () => {
    setIsTraining(true);
    (bleManager as any).startTrainingSession?.();
  };
  const stopTraining = () => {
    setIsTraining(false);
    (bleManager as any).stopTrainingSession?.();
  };
  const sendCue = (type: "vibrate" | "beep" | "tone" = "vibrate") => {
    const vibration = type === "vibrate" ? "gentle" : "pulse";
    (bleManager as any).sendComfortSignal?.("dog", { vibration });
  };

  // Active bucket for UI reads (dog only)
  const active = dogData;

  const recentSessions = [
    { id: "1", date: "Today · 08:10", duration: "18m", notes: "Recall + sit drills" },
    { id: "2", date: "Yesterday · 17:42", duration: "22m", notes: "Walk & tracking" },
    { id: "3", date: "Oct 10 · 10:00", duration: "30m", notes: "Fetch + focus" },
  ];

  const avg = (arr: number[]) => (arr && arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

  // ---------- Render ---------- //
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.textDark }]}>Dashboard</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Live metrics — Your Dog</Text>
          </View>

          {/* right side small meta (RSSI / FW) */}
        </View>

        {/* Top controls */}
        <View style={styles.topControlsRow}>
          <View style={styles.leftControls}>
            <AnimatedPressable
              onPress={() => toggleDogConnection()}
              style={[
                styles.connectBtn,
                {
                  backgroundColor: dogConnected ? theme.orange : theme.primary,
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MaterialIcons name={dogConnected ? "link-off" : "link"} size={18} color={theme.textOnPrimary} />
                <Text style={{ color: theme.textOnPrimary, fontWeight: "800" }}>{dogConnected ? "Disconnect" : "Connect"}</Text>
              </View>
            </AnimatedPressable>

            <TouchableOpacity onPress={assignConnectedToDog} style={{ padding: 8 }}>
              <Text style={{ color: theme.textMuted }}>Assign</Text>
            </TouchableOpacity>
          </View>

          {/* removed profile switcher - dog only */}
          <View style={{ width: 1 }} />
        </View>

        {/* ---------- TOP LIVE AREA: BPM (left) and Steps (right) ---------- */}
        <View style={styles.topRow}>
          {/* Heart Rate card (big) */}
          <LinearGradient
            colors={[theme.card, theme.cardElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.largeCard, { borderColor: theme.border, borderWidth: 1 }]}
          >
            <Text style={[styles.cardTitle, { color: theme.textMuted }]}>Dog Heart Rate</Text>

            <Animated.View style={[styles.heartWrap, { transform: [{ scale: heartPulse }], backgroundColor: theme.softPrimary }]}>
              <FontAwesome5 name="heart" size={36} color={theme.primary} />
            </Animated.View>

            <Text style={[styles.hrText, { color: theme.textDark }]}>{(active as any).heartRate ?? "--"} bpm</Text>
            <Text style={[styles.smallLabel, { color: theme.textMuted, marginTop: 8 }]}>Last measured just now</Text>
          </LinearGradient>

          {/* Steps card (compact) */}
          <LinearGradient
            colors={[theme.card, theme.cardElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.statCard, { borderColor: theme.border, borderWidth: 1 }]}
          >
            <Text style={[styles.cardTitle, { color: theme.textMuted }]}>Steps (today)</Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: theme.textDark, marginTop: 8 }}>{(active as any).steps ?? 0}</Text>
            <Text style={{ color: theme.textMuted, marginTop: 10, fontSize: 12 }}>Keep them active 🚶‍♀️</Text>
          </LinearGradient>
        </View>

        {/* Battery / SpO2 / Connection area (stacked) */}
        <View style={styles.stackedRow}>
          {/* Battery */}
          <View style={{ borderRadius: 12, padding: 14, backgroundColor: theme.card }}>
            <Text style={{ color: theme.textMuted, fontWeight: "700" }}>Battery</Text>
            <Text style={{ fontSize: 20, fontWeight: "800", color: theme.textDark, marginTop: 10 }}>{(active as any).battery ?? "--"}%</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6 }}>{((active as any).battery ?? 0) > 20 ? "Good" : "Low"}</Text>
          </View>

          {/* SpO2 */}
          <View style={{ borderRadius: 12, padding: 14, backgroundColor: theme.card }}>
            <Text style={{ color: theme.textMuted, fontWeight: "700" }}>SpO₂</Text>
            <Text style={{ fontSize: 20, fontWeight: "800", color: theme.textDark, marginTop: 10 }}>{active.spO2 ?? "--"}%</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6 }}>Blood oxygen</Text>
          </View>

          {/* Respiratory Rate */}
          <View style={{ borderRadius: 12, padding: 14, backgroundColor: theme.card }}>
            <Text style={{ color: theme.textMuted, fontWeight: "700" }}>Respiratory</Text>
            <Text style={{ fontSize: 20, fontWeight: "800", color: theme.textDark, marginTop: 10 }}>{active.respiratoryRate ?? "--"} bpm</Text>
            <Text style={{ color: theme.textMuted, marginTop: 6 }}>Breathing rate</Text>
          </View>

          {/* Connection */}
          <View style={{ borderRadius: 12, padding: 14, backgroundColor: theme.card }}>
            <Text style={{ color: theme.textMuted, fontWeight: "700" }}>Connection</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <MaterialIcons name="gps-fixed" size={18} color={theme.primary} />
              <Text style={{ fontWeight: "700", color: theme.textDark }}>{dogConnected ? "Connected" : "No Fix"}</Text>
            </View>
            <Text style={{ color: theme.textMuted, marginTop: 8 }}>{assignedDeviceName ?? "No device assigned"}</Text>
          </View>
        </View>

        {/* GRAPHS: bigger, labeled, show units & summary */}
        <View style={{ marginTop: 18, gap: 12 }}>
          {/* HR Graph */}
          <LinearGradient
            colors={[theme.card, theme.cardElevated]}
            style={[styles.cardLargeGraph, { borderColor: theme.border, borderWidth: 1 }]}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontWeight: "800", color: theme.textDark }}>7-day Heart Rate</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontWeight: "800", color: theme.textDark }}>{avg((active as any).hr7 ?? [])} bpm</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Average (bpm)</Text>
              </View>
            </View>

            <SevenDayBarChart
              data={(active as any).hr7 ?? [0, 0, 0, 0, 0, 0, 0]}
              colors={theme.gradientColors}
              height={110}
              labelColor={theme.textMuted}
            />
          </LinearGradient>

          {/* Steps Graph */}
          <LinearGradient
            colors={[theme.card, theme.cardElevated]}
            style={[styles.cardLargeGraph, { borderColor: theme.border, borderWidth: 1 }]}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontWeight: "800", color: theme.textDark }}>7-day Steps</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontWeight: "800", color: theme.textDark }}>
                  {((active as any).steps7 ?? []).reduce((a: number, b: number) => a + b, 0)} steps
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>Sum (7 days)</Text>
              </View>
            </View>

            <SevenDayBarChart
              data={(active as any).steps7 ?? [0, 0, 0, 0, 0, 0, 0]}
              colors={theme.gradientColors}
              height={110}
              labelColor={theme.textMuted}
            />
          </LinearGradient>
        </View>

        {/* Training controls + recent sessions */}
        <View style={{ marginTop: 18 }}>
          <Text style={[styles.sectionLabel, { color: theme.textDark }]}>Training</Text>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center", marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => (isTraining ? stopTraining() : startTraining())}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                minWidth: 100,
                backgroundColor: isTraining ? theme.orange : theme.primary,
              }}
            >
              <Text style={{ color: theme.textOnPrimary, fontWeight: "800" }}>{isTraining ? "Stop" : "Start"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => sendCue("vibrate")}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.textDark }}>Vibrate</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => sendCue("beep")}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.textDark }}>Beep</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => sendCue("tone")}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.textDark }}>Tone</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: theme.textMuted, marginBottom: 8 }}>Recent Sessions</Text>
            {recentSessions.map((s) => (
              <View key={s.id} style={{ backgroundColor: theme.card, borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "800", color: theme.textDark }}>{s.notes}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>{s.duration}</Text>
                </View>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 6 }}>{s.date}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Small footer / debug row */}
        <View style={{ marginTop: 24, marginBottom: 60 }}>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>Device</Text>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <MaterialCommunityIcons name="bluetooth" size={20} color={theme.primary} />
            <Text style={{ color: theme.textMuted }}>{assignedDeviceName ?? "No device assigned"}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
