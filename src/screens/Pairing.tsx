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
  Linking,
  PermissionsAndroid,
  Modal,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { bleManager, Role } from "../ble/BLEManager";
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";
import { savePairedDevice } from "../storage/pairedDevices";
import { BleManager } from "react-native-ble-plx";

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
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);

  // --------------------------------------------------------------------------------------
  // INIT - Check Bluetooth state and request permissions
  // --------------------------------------------------------------------------------------
  useEffect(() => {
    const checkBluetoothAndRequestPermissions = async () => {
      try {
        // Get the underlying BleManager instance
        const manager = (bleManager as any).manager as BleManager;
        if (!manager) {
          console.warn("BLE Manager not available");
          return;
        }

        // Check current Bluetooth state
        const state = await manager.state();
        console.log("Bluetooth state:", state);

        if (state === "PoweredOff") {
          // Bluetooth is off - request to enable it
          if (Platform.OS === "android") {
            Alert.alert(
              "Bluetooth Required",
              "Bluetooth needs to be turned on to scan for devices. Would you like to enable it now?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Enable",
                  onPress: async () => {
                    try {
                      // Request permissions first
                      const granted = await PermissionsAndroid.requestMultiple([
                        "android.permission.BLUETOOTH_SCAN",
                        "android.permission.BLUETOOTH_CONNECT",
                        "android.permission.ACCESS_FINE_LOCATION",
                      ]);

                      // Check if permissions granted
                      const allGranted =
                        granted["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
                        granted["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED &&
                        granted["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED;

                      if (allGranted) {
                        // Open Bluetooth settings to enable Bluetooth
                        // Note: We can't programmatically enable Bluetooth on Android, but we can open settings
                        Linking.openSettings().catch(() => {
                          Alert.alert(
                            "Enable Bluetooth",
                            "Please enable Bluetooth in your device settings to continue."
                          );
                        });
                      } else {
                        Alert.alert(
                          "Permissions Required",
                          "Bluetooth permissions are required to scan for devices. Please grant permissions in settings."
                        );
                      }
                    } catch (error) {
                      console.warn("Failed to request permissions:", error);
                      Alert.alert("Error", "Failed to request Bluetooth permissions.");
                    }
                  },
                },
              ]
            );
          } else {
            // iOS - just show alert
            Alert.alert(
              "Bluetooth Required",
              "Please enable Bluetooth in Settings to scan for devices."
            );
          }
          setBtOn(false);
        } else if (state === "Unauthorized") {
          // Request permissions
          if (Platform.OS === "android") {
            try {
              const granted = await PermissionsAndroid.requestMultiple([
                "android.permission.BLUETOOTH_SCAN",
                "android.permission.BLUETOOTH_CONNECT",
                "android.permission.ACCESS_FINE_LOCATION",
              ]);

              const allGranted =
                granted["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
                granted["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED &&
                granted["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED;

              if (!allGranted) {
                Alert.alert(
                  "Permissions Required",
                  "Bluetooth permissions are required to scan for devices."
                );
                setBtOn(false);
                return;
              }
            } catch (error) {
              console.warn("Permission request failed:", error);
              setBtOn(false);
              return;
            }
          }
          setBtOn(false);
        } else if (state === "PoweredOn") {
          setBtOn(true);
        } else {
          setBtOn(false);
        }

        // Listen for state changes
        manager.onStateChange((newState) => {
          console.log("Bluetooth state changed:", newState);
          setBtOn(newState === "PoweredOn");
        });
      } catch (error) {
        console.warn("Failed to check Bluetooth state:", error);
        setBtOn(false);
      }
    };

    checkBluetoothAndRequestPermissions();

    const onData = () => { };
    bleManager.on?.("data", onData);

    return () => {
      if (bleManager.off) bleManager.off("data", onData);
    };
  }, []);

  // --------------------------------------------------------------------------------------
  // SCANNING - Shows ANY Polar H10 or PossumBond-Vest devices by name pattern
  // --------------------------------------------------------------------------------------
  const startScan = () => {
    try {
      setDevices([]);
      setIsScanning(true);

      // Safety check: ensure bleManager and startScan exist
      if (!bleManager || typeof bleManager.startScan !== "function") {
        Alert.alert("Error", "Bluetooth manager not available");
        setIsScanning(false);
        return;
      }

      bleManager.startScan((d) => {
        try {
          // Safety: Validate device data
          if (!d || !d.id) return;

          // Note: Device name might be null for some devices, but we can still match by service UUID
          const nameLower = (d.name || "").toLowerCase().trim();
          
          // v1: Only PawsomeBond harness (vest)
          const isVest = nameLower === "pawsomebond-vest" ||
                        nameLower === "pawsomebond vest" ||
                        nameLower.startsWith("pawsomebond") ||
                        (nameLower.includes("pawsomebond") && nameLower.includes("vest")) ||
                        nameLower.includes("pawsomebond-vest");
          
          if (!isVest) {
            // Skip unknown devices (though BLEManager should have filtered these already)
            return;
          }

          setDevices((prev) => {
            try {
              // Safety: Ensure prev is an array
              const safePrev = Array.isArray(prev) ? prev : [];
              // Don't add duplicates
              if (safePrev.some((x) => x && x.id === d.id)) return safePrev;
              
              // If vest detected but name is missing or empty, use default (so connection has a valid name)
              const displayName = (!d.name || (d.name || "").trim() === "")
                ? "PAWSOMEBOND-VEST"
                : d.name;
              
              return [...safePrev, { ...d, name: displayName }];
            } catch (err) {
              console.warn("Error updating device list:", err);
              return prev;
            }
          });
        } catch (err) {
          console.warn("Error processing scanned device:", err);
        }
      });
    } catch (error: any) {
      console.error("Failed to start scan:", error);
      Alert.alert("Error", `Failed to start scanning: ${error?.message || "Unknown error"}`);
      setIsScanning(false);
    }

    // Auto-stop after 15 sec (increased to give more time to find devices)
    setTimeout(() => {
      stopScan();
    }, 15000);
  };

  const stopScan = () => {
    try {
      setIsScanning(false);
      if (bleManager && typeof bleManager.stopScan === "function") {
        bleManager.stopScan();
      }
    } catch (error: any) {
      console.warn("Error stopping scan:", error);
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (preferredTarget && !isScanning) {
      startScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredTarget]);

  // --------------------------------------------------------------------------------------
  // ROLE SELECTION - AUTO-DETECT WITH MANUAL FALLBACK
  // --------------------------------------------------------------------------------------

  // Helper function to get device type icon and label
  const getDeviceTypeInfo = (deviceName: string | null | undefined, deviceId?: string | null) => {
    const nameLower = (deviceName || "").toLowerCase().trim();
    
    // Check if it's a vest - More flexible matching
    if (nameLower === "pawsomebond-vest" ||
        nameLower === "pawsomebond vest" ||
        nameLower.startsWith("pawsomebond") ||
        (nameLower.includes("pawsomebond") && nameLower.includes("vest")) ||
        nameLower.includes("pawsomebond-vest") ||
        nameLower === "") { // Empty name might be vest detected by service UUID
      // If name is empty but we're checking, it might be a vest detected by service UUID
      // We'll check if it's actually a vest when connecting
      return { icon: "🦺", label: "PAWSOMEBOND-VEST", type: "vest" as Role };
    }
    
    // Check if it's a Polar H10
    if (nameLower.includes("polar h10") || nameLower.includes("polar h 10")) {
      return { icon: "💓", label: "Polar H10 (select role)", type: null };
    }
    
    return { icon: "❓", label: "Unknown Device", type: null };
  };

  const pickRole = (dev: DeviceItem) => {
    // v1: All scanned devices are harness (vest)
    finalConnect(dev, "vest");
  };

  const showManualPicker = (dev: DeviceItem) => {
    const deviceName = dev.name ?? "Unknown Device";
    
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Assign Role to Device`,
          message: `${deviceName}\n\nSelect how this device will be used:`,
          options: ["Human (Polar H10)", "Dog (Polar H10)", "Vest (PossumBond)", "Cancel"],
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
        "Assign Device Role",
        `What role should this device have?\n\n${deviceName}`,
        [
          { text: "Human (Polar H10)", onPress: () => finalConnect(dev, "human") },
          { text: "Dog (Polar H10)", onPress: () => finalConnect(dev, "dog") },
          { text: "Vest (PossumBond)", onPress: () => finalConnect(dev, "vest") },
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
      // Safety: Validate device
      if (!device || !device.id) {
        Alert.alert("Error", "Invalid device selected.");
        return;
      }

      // For vest, ensure we have a proper name even if it was detected by service UUID
      const deviceName = device.name || (type === "vest" ? "PAWSOMEBOND-VEST" : `${type} device`);

      const descriptor = {
        ...device,
        mac: device.mac ?? device.id,
        name: deviceName,
        rssi: (typeof device.rssi === 'number') ? device.rssi : -60,
      };

      // Safety: Validate descriptor
      if (!descriptor.id || descriptor.id.length === 0) {
        Alert.alert("Error", "Device ID is missing.");
        return;
      }

      // Safety: Check if bleManager methods exist
      if (!bleManager || typeof bleManager.assignDeviceType !== "function") {
        Alert.alert("Error", "Bluetooth manager not available");
        return;
      }

      try {
        bleManager.assignDeviceType(descriptor, type);
      } catch (assignError: any) {
        console.warn("Failed to assign device type:", assignError);
        Alert.alert("Error", "Failed to assign device type. Check logs.");
        return;
      }

      // Safety: Check if connectToScannedDevice exists
      if (typeof bleManager.connectToScannedDevice !== "function") {
        Alert.alert("Error", "Connection function not available");
        return;
      }

      setConnectingDeviceId(descriptor.id);
      console.log(`Connecting to ${descriptor.name} as ${type}...`);

      try {
        await bleManager.connectToScannedDevice(descriptor, type);
      } catch (connectError: any) {
        setConnectingDeviceId(null);
        console.warn("Connect failed:", connectError);
        const errorMessage = connectError?.message || connectError?.toString() || "Unknown error";
        
        // For vest, provide more specific error guidance
        const errorGuidance = type === "vest" 
          ? `Failed to connect to ${descriptor.name}:\n\n${errorMessage}\n\nPlease ensure:\n• Vest is powered on\n• Vest is nearby (within 10 feet)\n• Bluetooth is enabled\n• Try scanning again\n• If vest was just turned on, wait 5 seconds and scan again`
          : `Failed to connect to ${descriptor.name || type} device:\n\n${errorMessage}\n\nPlease ensure:\n• Device is powered on\n• Device is nearby\n• Bluetooth is enabled\n• Try scanning again`;
        
        Alert.alert("Connection Failed", errorGuidance);
        return;
      }

      setConnectingDeviceId(null);

      try {
        await savePairedDevice(type, descriptor);
      } catch (saveError: any) {
        console.warn("Failed to save paired device:", saveError);
        // Non-critical - connection succeeded even if save failed
      }

      Alert.alert(
        "Connected",
        `Successfully connected to ${descriptor.name} as ${type.toUpperCase()}`
      );
    } catch (err: any) {
      setConnectingDeviceId(null);
      console.warn("Connect failed:", err);
      const errorMessage = err?.message || err?.toString() || "Unknown error";
      Alert.alert(
        "Connection Error", 
        `Failed to connect:\n\n${errorMessage}\n\nPlease try:\n• Scanning again\n• Checking device power\n• Ensuring Bluetooth is enabled`
      );
    }
  };

  // --------------------------------------------------------------------------------------
  // RENDER LIST ROW
  // --------------------------------------------------------------------------------------
  const renderItem = ({ item }: { item: DeviceItem }) => {
    const typeInfo = getDeviceTypeInfo(item.name, item.id);
    const isConnecting = connectingDeviceId === item.id;

    return (
      <TouchableOpacity
        style={[styles.deviceRow, isConnecting && styles.deviceRowConnecting]}
        onPress={() => pickRole(item)}
        disabled={isConnecting}
      >
        <View style={styles.deviceIcon}>
          {isConnecting ? (
            <ActivityIndicator size="small" color={activeTheme.primary} />
          ) : (
            <Text style={{ fontSize: 24 }}>{typeInfo.icon}</Text>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.deviceName}>{item.name ?? "Unknown Device"}</Text>
          <Text style={styles.deviceSub}>{item.mac ?? item.id}</Text>
          <Text style={[
            styles.deviceType,
            { color: typeInfo.type ? activeTheme.success : activeTheme.textMuted }
          ]}>
            {isConnecting ? "Connecting…" : typeInfo.label}
          </Text>
        </View>

        <View style={styles.rssiWrap}>
          {isConnecting ? (
            <ActivityIndicator size="small" color={activeTheme.primary} />
          ) : (
            <Text style={styles.rssiText}>{item.rssi ?? "-"}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // --------------------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------------------
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Find Your Device</Text>
        <Text style={styles.subtitle}>Scanning for any Polar H10 or PossumBond-Vest devices</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push("/dashboard")}>
            <Text style={styles.link}>Open Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/settings")}>
            <Text style={styles.link}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
        {preferredTarget ? (
          <Text style={styles.preferred}>
            Prefers {preferredTarget === "dog" ? "Dog Polar H10" : preferredTarget === "human" ? "Human Polar H10" : "Therapy vest"}
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

          {connectingDeviceId ? (
            <Modal visible transparent animationType="fade">
              <View style={[styles.connectingOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
                <View style={[styles.connectingBox, { backgroundColor: activeTheme.card }]}>
                  <ActivityIndicator size="large" color={activeTheme.primary} />
                  <Text style={[styles.connectingText, { color: activeTheme.textDark }]}>Connecting to device…</Text>
                  <Text style={[styles.connectingSub, { color: activeTheme.textMuted }]}>Please wait</Text>
                </View>
              </View>
            </Modal>
          ) : null}

          <FlatList
            data={devices}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No compatible devices found</Text>
                <Text style={styles.emptySub}>
                  Looking for: Polar H10 or PAWSOMEBOND-VEST devices
                </Text>
                <Text style={[styles.emptySub, { marginTop: 8, fontSize: 12 }]}>
                  Make sure your devices are powered on and nearby. Tap a device to assign its role (Human/Dog/Vest).
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
    deviceRowConnecting: {
      opacity: 0.85,
    },

    deviceName: { fontWeight: "700", color: theme.textDark },
    deviceSub: { color: theme.textMuted, marginTop: 2, fontSize: 12 },
    deviceType: { marginTop: 4, fontSize: 12, fontWeight: "600" },
    deviceIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.softPrimary,
      alignItems: "center",
      justifyContent: "center",
    },

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

    connectingOverlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    connectingBox: {
      padding: 28,
      borderRadius: 16,
      alignItems: "center",
      minWidth: 220,
    },
    connectingText: { fontSize: 16, fontWeight: "700", marginTop: 14 },
    connectingSub: { fontSize: 13, marginTop: 4 },
  });
