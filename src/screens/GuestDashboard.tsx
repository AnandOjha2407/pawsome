// Guest Dashboard — Dog Walker view: limited to emoji, anxiety, battery, STOP
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";
import { MaterialIcons } from "@expo/vector-icons";
import { bleManager } from "../ble/BLEManager";
import type { DeviceDescriptor } from "../ble/BLEManager";
import auth from "@react-native-firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { writeLiveTelemetry } from "../firebase/firebase";

const GUEST_MODE_KEY = "@pawsomebond_guest_mode";

const STATE_EMOJI: Record<string, any> = {
  SLEEPING: require("../../assets/custom_emoji/sleeping.png"),
  CALM: require("../../assets/custom_emoji/relaxed.png"),
  ALERT: require("../../assets/custom_emoji/alert.png"),
  ANXIOUS: require("../../assets/custom_emoji/worried.png"),
  ACTIVE: require("../../assets/custom_emoji/active.png"),
};

type TelemetryData = {
  state?: string;
  anxietyScore?: number;
  batteryPercent?: number;
  [key: string]: unknown;
};

export default function GuestDashboard() {
  const { theme } = useTheme();
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DeviceDescriptor[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [sendingStop, setSendingStop] = useState(false);

  // Listen for BLE telemetry
  useEffect(() => {
    const onTelemetry = (data: TelemetryData) => {
      setTelemetry(data);
      // Bridge to Firebase via cellular
      if (connectedDeviceId) {
        writeLiveTelemetry(connectedDeviceId, data).catch(() => {});
      }
    };
    bleManager.on("telemetry", onTelemetry);

    const onConnections = () => {
      const conns = bleManager.getConnections();
      setConnected(conns.connected.vest);
    };
    bleManager.on("connections", onConnections);

    return () => {
      bleManager.off("telemetry", onTelemetry);
      bleManager.off("connections", onConnections);
    };
  }, [connectedDeviceId]);

  const handleScan = async () => {
    setScanning(true);
    setDevices([]);
    try {
      await bleManager.startScan((dev) => {
        setDevices((prev) => {
          if (prev.some((d) => d.id === dev.id)) return prev;
          return [...prev, dev];
        });
      });
      setTimeout(() => {
        bleManager.stopScan();
        setScanning(false);
      }, 10000);
    } catch (e: any) {
      Alert.alert("Scan Error", e?.message ?? "Could not scan.");
      setScanning(false);
    }
  };

  const handleConnect = async (dev: DeviceDescriptor) => {
    setScanning(false);
    bleManager.stopScan();
    try {
      await bleManager.connectToScannedDevice(dev, "vest");
      setConnected(true);
      const name = dev.name ?? "";
      const idMatch = name.match(/PB-(\w+)/i);
      const deviceId = idMatch ? `PB-${idMatch[1]}` : name;
      setConnectedDeviceId(deviceId);
    } catch (e: any) {
      Alert.alert("Connection Failed", e?.message ?? "Could not connect.");
    }
  };

  const handleEmergencyStop = async () => {
    setSendingStop(true);
    try {
      const ok = await bleManager.sendStopBLE();
      if (!ok) Alert.alert("Error", "Failed to send stop.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed.");
    } finally {
      setSendingStop(false);
    }
  };

  const handleExitGuest = async () => {
    await AsyncStorage.removeItem(GUEST_MODE_KEY);
    bleManager.disconnect();
    await auth().signOut();
    router.replace("/login" as any);
  };

  const state = (telemetry?.state ?? "CALM") as string;
  const emoji = STATE_EMOJI[state] ?? STATE_EMOJI.CALM;
  const anxiety = telemetry?.anxietyScore ?? 0;
  const battery = telemetry?.batteryPercent ?? 0;

  if (!connected) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
        <View style={[styles.guestBanner, { borderColor: "#D29922" }]}>
          <Text style={[styles.guestBannerText, { color: "#D29922" }]}>Guest Mode — Dog Walker View</Text>
        </View>
        <View style={styles.scanContainer}>
          <Text style={[styles.title, { color: theme.textDark }]}>Connect to Harness</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Scan for a nearby PawsomeBond harness to start monitoring.
          </Text>
          <TouchableOpacity
            onPress={handleScan}
            disabled={scanning}
            style={[styles.scanBtn, { backgroundColor: theme.primary, opacity: scanning ? 0.6 : 1 }]}
          >
            {scanning ? (
              <View style={styles.scanningRow}>
                <ActivityIndicator size="small" color="#000" />
                <Text style={[styles.scanBtnText, { marginLeft: 10 }]}>Scanning…</Text>
              </View>
            ) : (
              <Text style={styles.scanBtnText}>Scan for Harness</Text>
            )}
          </TouchableOpacity>

          {devices.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Nearby Devices</Text>
              {devices.map((dev) => (
                <TouchableOpacity
                  key={dev.id}
                  onPress={() => handleConnect(dev)}
                  style={[styles.deviceCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                >
                  <Text style={[styles.deviceName, { color: theme.textDark }]}>{dev.name ?? "Unknown"}</Text>
                  <Text style={[styles.deviceRssi, { color: theme.textMuted }]}>Signal: {dev.rssi ?? "—"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity onPress={handleExitGuest} style={styles.exitBtn}>
            <Text style={[styles.exitText, { color: theme.textMuted }]}>Exit Guest Mode</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background, borderColor: "#D29922", borderWidth: 2 }]} edges={["top"]}>
      <View style={[styles.guestBanner, { borderColor: "#D29922" }]}>
        <Text style={[styles.guestBannerText, { color: "#D29922" }]}>Guest Mode — Dog Walker View</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Emoji state */}
        <View style={styles.emojiContainer}>
          <Image source={emoji} style={styles.emojiImage} resizeMode="contain" />
          <Text style={[styles.stateLabel, { color: theme.textDark }]}>{state}</Text>
        </View>

        {/* Anxiety score */}
        <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Anxiety Score</Text>
          <Text style={[styles.metricValue, { color: anxiety > 66 ? "#F85149" : anxiety > 33 ? "#D29922" : "#3FB950" }]}>
            {anxiety}
          </Text>
          <View style={[styles.anxietyBar, { backgroundColor: theme.border }]}>
            <View style={[styles.anxietyFill, { width: `${Math.min(100, anxiety)}%`, backgroundColor: anxiety > 66 ? "#F85149" : anxiety > 33 ? "#D29922" : "#3FB950" }]} />
          </View>
        </View>

        {/* Battery */}
        <View style={[styles.metricCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Battery</Text>
          <Text style={[styles.metricValue, { color: battery < 20 ? "#F85149" : theme.textDark }]}>
            {battery}%
          </Text>
        </View>

        {/* Emergency Stop */}
        <TouchableOpacity
          onPress={handleEmergencyStop}
          disabled={sendingStop}
          style={[styles.stopBtn, { opacity: sendingStop ? 0.6 : 1 }]}
        >
          {sendingStop ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="stop" size={32} color="#fff" />
              <Text style={styles.stopText}>EMERGENCY STOP</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleExitGuest} style={[styles.exitBtnBottom]}>
          <Text style={[styles.exitText, { color: theme.textMuted }]}>Exit Guest Mode</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  guestBanner: { paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 2, alignItems: "center" },
  guestBannerText: { fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  scanContainer: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 24, lineHeight: 20 },
  scanBtn: { padding: 16, borderRadius: 12, alignItems: "center" },
  scanBtnText: { fontSize: 16, fontWeight: "800", color: "#000" },
  scanningRow: { flexDirection: "row", alignItems: "center" },
  sectionLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  deviceCard: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  deviceName: { fontSize: 16, fontWeight: "700" },
  deviceRssi: { fontSize: 12, marginTop: 4 },
  scroll: { padding: 20, paddingBottom: 40, alignItems: "center" },
  emojiContainer: { alignItems: "center", marginVertical: 24 },
  emojiImage: { width: 120, height: 120 },
  stateLabel: { fontSize: 20, fontWeight: "800", marginTop: 12 },
  metricCard: { width: "100%", padding: 20, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  metricLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { fontSize: 36, fontWeight: "800" },
  anxietyBar: { height: 6, borderRadius: 3, marginTop: 10 },
  anxietyFill: { height: 6, borderRadius: 3 },
  stopBtn: { width: "100%", backgroundColor: "#F85149", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, padding: 20, borderRadius: 14, marginTop: 10 },
  stopText: { fontSize: 20, fontWeight: "900", color: "#fff" },
  exitBtn: { marginTop: 40, alignItems: "center" },
  exitBtnBottom: { marginTop: 30, alignItems: "center" },
  exitText: { fontSize: 14, fontWeight: "600" },
});
