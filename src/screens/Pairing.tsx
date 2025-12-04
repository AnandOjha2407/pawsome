// src/screens/Pairing.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { bleManager } from "../ble/BLEManager";
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";
import { savePairedDevice } from "../storage/pairedDevices";

type DeviceItem = {
  id: string;
  name?: string | null;
  mac?: string;
  rssi?: number | null;
};

export default function Pairing() {
  const { theme: activeTheme } = useTheme();
  const styles = createStyles(activeTheme);
  const router = useRouter();
  const route = useRoute<any>();
  const preferredTarget = route?.params?.target as
    | "dog"
    | "human"
    | "vest"
    | undefined;

  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [btOn, setBtOn] = useState(true);

  // --------------------------------------------------------------------------------------
  // INIT
  // --------------------------------------------------------------------------------------
  useEffect(() => {
    // For now assume Bluetooth is ON
    setBtOn(true);

    const onData = () => {};
    bleManager.on?.("data", onData);

    return () => {
      if (bleManager.off) bleManager.off("data", onData);
    };
  }, []);

  // --------------------------------------------------------------------------------------
  // SCANNING
  // --------------------------------------------------------------------------------------
  const startScan = () => {
    setDevices([]);
    setIsScanning(true);

    bleManager.startScan((d) => {
      setDevices((prev) => {
        if (prev.some((x) => x.id === d.id)) return prev;
        return [...prev, d];
      });
    });

    // Auto-stop after 8 sec
    setTimeout(() => {
      stopScan();
    }, 8000);
  };

  const stopScan = () => {
    setIsScanning(false);
    bleManager.stopScan();
  };

  useEffect(() => {
    if (preferredTarget && !isScanning) {
      startScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredTarget]);

  // --------------------------------------------------------------------------------------
  // ROLE SELECTION POPUP (Option C)
  // --------------------------------------------------------------------------------------
  const pickRole = (dev: DeviceItem) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Select Device Type`,
          options: ["Human (GTS10)", "Dog (GTL1)", "Vest (ESP32)", "Cancel"],
          cancelButtonIndex: 3,
        },
        (index) => {
          if (index === 0) finalConnect(dev, "human");
          if (index === 1) finalConnect(dev, "dog");
          if (index === 2) finalConnect(dev, "vest");
        }
      );
    } else {
      // Android fallback — simple Alert-based picker
      Alert.alert(
        "Select Device Type",
        `What device is this?\n\n${dev.name ?? dev.id}`,
        [
          { text: "Human (GTS10)", onPress: () => finalConnect(dev, "human") },
          { text: "Dog (GTL1)", onPress: () => finalConnect(dev, "dog") },
          { text: "Vest (ESP32)", onPress: () => finalConnect(dev, "vest") },
          { text: "Cancel", style: "cancel" },
        ]
      );
    }
  };

  // --------------------------------------------------------------------------------------
  // FINAL CONNECT (matches your BLEManager)
  // --------------------------------------------------------------------------------------
  const finalConnect = async (
    device: DeviceItem,
    type: "human" | "dog" | "vest"
  ) => {
    try {
      const descriptor = {
        ...device,
        mac: device.mac ?? device.id,
        name: device.name ?? `${type} device`,
        rssi: device.rssi ?? -60,
      };

      bleManager.assignDeviceType(descriptor, type);
      await bleManager.connectToScannedDevice(descriptor, type);
      await savePairedDevice(type, descriptor);

      Alert.alert(
        "Connected",
        `Connected to ${descriptor.name} as ${type.toUpperCase()}`
      );
    } catch (err) {
      console.warn("Connect failed", err);
      Alert.alert("Error", "Failed to connect. Check logs.");
    }
  };

  // --------------------------------------------------------------------------------------
  // RENDER LIST ROW
  // --------------------------------------------------------------------------------------
  const renderItem = ({ item }: { item: DeviceItem }) => (
    <TouchableOpacity
      style={styles.deviceRow}
      onPress={() => pickRole(item)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.deviceName}>{item.name ?? "Unknown Device"}</Text>
        <Text style={styles.deviceSub}>{item.mac ?? item.id}</Text>
      </View>

      <View style={styles.rssiWrap}>
        <Text style={styles.rssiText}>{item.rssi ?? "-"}</Text>
      </View>
    </TouchableOpacity>
  );

  // --------------------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------------------
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Find Your Device</Text>
        <Text style={styles.subtitle}>Tap a device to select type</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push("/(tabs)/dashboard")}>
            <Text style={styles.link}>Open Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(tabs)/settings")}>
            <Text style={styles.link}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
        {preferredTarget ? (
          <Text style={styles.preferred}>
            Prefers {preferredTarget === "dog" ? "Dog collar" : preferredTarget === "human" ? "Human wearable" : "Therapy vest"}
          </Text>
        ) : null}
      </View>

      {!btOn ? (
        <View style={styles.center}>
          <MaterialIcons
            name="bluetooth-disabled"
            size={56}
            color={activeTheme.textMuted}
          />
          <Text style={styles.centerText}>Bluetooth is Off</Text>
        </View>
      ) : (
        <>
          <View style={styles.controls}>
            {!isScanning ? (
              <TouchableOpacity style={styles.scanBtn} onPress={startScan}>
                <MaterialIcons name="search" size={18} color={activeTheme.textOnPrimary} />
                <Text style={styles.scanText}> Scan for devices</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.scanBtn, styles.scanBtnStop]}
                onPress={stopScan}
              >
                <ActivityIndicator color={activeTheme.textOnPrimary} style={{ marginRight: 8 }} />
                <Text style={styles.scanText}> Scanning…</Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={devices}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No devices found</Text>
                <Text style={styles.emptySub}>
                  Start scan or move closer to the device.
                </Text>
              </View>
            }
            contentContainerStyle={{ padding: 12 }}
          />
        </>
      )}
    </View>
  );
}

// --------------------------------------------------------------------------------------
// STYLES
// --------------------------------------------------------------------------------------
const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },

    header: { padding: 18 },
    title: { fontSize: 22, fontWeight: "700", color: theme.textDark },
    subtitle: { color: theme.textMuted, marginTop: 6 },
    headerActions: { flexDirection: "row", gap: 16, marginTop: 12 },
    link: { color: theme.primary, fontWeight: "700" },
    preferred: { color: theme.textMuted, marginTop: 8, fontSize: 12 },

    center: { alignItems: "center", padding: 18 },
    centerText: { fontSize: 18, marginTop: 12, color: theme.textDark },

    controls: { paddingHorizontal: 12, paddingBottom: 8, flexDirection: "row" },

    scanBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.primary,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
    },
    scanBtnStop: { backgroundColor: theme.orange },
    scanText: { color: theme.textOnPrimary, fontWeight: "700" },

    deviceRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.card,
      padding: 14,
      borderRadius: 12,
      marginBottom: 10,
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },

    deviceName: { fontWeight: "700", color: theme.textDark },
    deviceSub: { color: theme.textMuted, marginTop: 4 },

    rssiWrap: {
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: theme.softPrimary,
    },
    rssiText: { color: theme.primary, fontWeight: "700" },

    empty: { alignItems: "center", padding: 24 },
    emptyText: { fontSize: 16, fontWeight: "700", color: theme.textDark },
    emptySub: { color: theme.textMuted, marginTop: 6 },
  });
