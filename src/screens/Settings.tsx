// src/screens/Settings.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { bleManager } from "../ble/BLEManager";
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";

/**
 * Settings screen with lightweight BLE integration.
 * Theme-aware: uses theme tokens from useTheme()
 */

type Role = "human" | "dog";
const STORAGE_KEY = "@app_settings_v1";

export default function Settings() {
  const { theme } = useTheme();

  const [name, setName] = useState<string>("");
  const [role, setRole] = useState<Role>("human");

  // new: hold paired devices separately (dog = GTL1, human = GTS10, vest = DogGPT)
  const [pairedDevices, setPairedDevices] = useState<{
    dog?: { id?: string; name?: string };
    human?: { id?: string; name?: string };
    vest?: { id?: string; name?: string };
  }>({});

  const scanTargetRef = useRef<"dog" | "human" | "vest" | null>(null);

  const [autoConnect, setAutoConnect] = useState<boolean>(true);
  const [keepBleAlive, setKeepBleAlive] = useState<boolean>(false);
  const [unitsMetric, setUnitsMetric] = useState<boolean>(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const [hrAlertEnabled, setHrAlertEnabled] = useState<boolean>(false);
  const [hrAlertThreshold, setHrAlertThreshold] = useState<string>("140");
  const [autoSync, setAutoSync] = useState<boolean>(true);
  const [shareData, setShareData] = useState<boolean>(false);
  const [themeDog, setThemeDog] = useState<boolean>(true);
  const [sdkInfoCollapsed, setSdkInfoCollapsed] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  // BLE scanning state
  const [scanning, setScanning] = useState<boolean>(false);
  const discoveredRef = useRef<Array<{ id?: string; name: string }>>([]);
  const scanTimerRef = useRef<any>(null);

  // ---------- load saved settings ----------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mounted) {
          const parsed = JSON.parse(raw);
          setName(parsed.name ?? "");
          setRole(parsed.role ?? "human");
          setPairedDevices(parsed.pairedDevices ?? {});
          setAutoConnect(parsed.autoConnect ?? true);
          setKeepBleAlive(parsed.keepBleAlive ?? false);
          setUnitsMetric(parsed.unitsMetric ?? true);
          setNotificationsEnabled(parsed.notificationsEnabled ?? true);
          setHrAlertEnabled(parsed.hrAlertEnabled ?? false);
          setHrAlertThreshold(parsed.hrAlertThreshold ?? "140");
          setAutoSync(parsed.autoSync ?? true);
          setShareData(parsed.shareData ?? false);
          setThemeDog(parsed.themeDog ?? true);
        }
      } catch (e) {
        console.warn("Settings: failed to load storage", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // cleanup listeners if any on unmount
    return () => {
      mounted = false;
      stopScanIfRunning();
      try {
        (bleManager as any)?.off?.("device", onDeviceDiscovered);
        (bleManager as any)?.off?.("connected", onConnected);
        (bleManager as any)?.off?.("disconnected", onDisconnected);
      } catch (e) {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist helper (stores pairedDevices now)
  const persist = async () => {
    const payload = {
      name,
      role,
      pairedDevices,
      autoConnect,
      keepBleAlive,
      unitsMetric,
      notificationsEnabled,
      hrAlertEnabled,
      hrAlertThreshold,
      autoSync,
      shareData,
      themeDog,
    };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Settings: failed to save", e);
    }
  };

  // ---------------- BLE helpers ----------------

  // callback: when a device is discovered during scanning
  const onDeviceDiscovered = (device: any) => {
    if (!device) return;
    const normalized = {
      id: device.id ?? device.identifier ?? undefined,
      name: device.name ?? device.localName ?? device.model ?? "Unknown device",
    };
    const found = discoveredRef.current.some((d) => d.id && normalized.id && d.id === normalized.id);
    if (!found) {
      discoveredRef.current.push(normalized);
      console.log("[Settings] discovered device:", normalized);
    }
  };

  // start scanning for a specific device type (dog/human/vest)
  const startScanFor = (type: "dog" | "human" | "vest", timeoutMs = 4000) => {
    if (scanning) return;
    discoveredRef.current = [];
    setScanning(true);
    scanTargetRef.current = type;
    console.log(`[Settings] startScanFor(${type}) -> calling bleManager.startScan`);

    try {
      (bleManager as any)?.on?.("device", onDeviceDiscovered);
      if ((bleManager as any)?.startScan) {
        (bleManager as any).startScan();
      } else if ((bleManager as any)?.scan) {
        (bleManager as any).scan();
      } else {
        console.warn("bleManager.startScan / scan not implemented — ensure BLE manager exposes scanning.");
      }
    } catch (e) {
      console.warn("startScanFor error", e);
    }

    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = setTimeout(async () => {
      stopScanIfRunning();
      const found = discoveredRef.current;
      if (!found || found.length === 0) {
        Alert.alert("No devices found", "No BLE devices were discovered. Make sure the device is advertising and try again.");
        return;
      }

      // For now pick first found (we can show a list later)
      const first = found[0];
      Alert.alert(
        "Device discovered",
        `Found "${first.name}" — pair and connect this as ${type === "dog" ? "Dog" : type === "human" ? "Human" : "Vest"} device?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Pair",
            onPress: async () => {
              try {
                // try connect with the device id (if bleManager supports connectToDevice)
                if (first.id && (bleManager as any)?.connectToDevice) {
                  await (bleManager as any).connectToDevice(first.id);
                } else if ((bleManager as any)?.connect) {
                  await (bleManager as any).connect?.();
                }
              } catch (e) {
                console.warn("Pair/connect failed (non-fatal):", e);
              }

              // assign profile if BLE manager supports it (keeps old behavior)
              try {
                if (type === "dog") (bleManager as any).assignProfile?.("dog");
                else if (type === "human") (bleManager as any).assignProfile?.("human");
              } catch (e) {
                /* noop */
              }

              // persist locally in pairedDevices
              const next = { ...(pairedDevices || {}) } as any;
              if (type === "dog") next.dog = first;
              if (type === "human") next.human = first;
              if (type === "vest") next.vest = first;

              setPairedDevices(next);
              try {
                // persist fully (merge with existing storage)
                const raw = await AsyncStorage.getItem(STORAGE_KEY);
                const base = raw ? JSON.parse(raw) : {};
                base.pairedDevices = next;
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(base));
              } catch (e) {
                console.warn("persist after pair failed", e);
              }

              Alert.alert("Paired", `Device "${first.name}" paired as ${type}.`);
            },
          },
        ],
        { cancelable: true }
      );
    }, timeoutMs);
  };

  const stopScanIfRunning = () => {
    if (!scanning) return;
    setScanning(false);
    scanTargetRef.current = null;
    try {
      if ((bleManager as any)?.stopScan) {
        (bleManager as any).stopScan();
      } else if ((bleManager as any)?.stop) {
        (bleManager as any).stop();
      }
      (bleManager as any)?.off?.("device", onDeviceDiscovered);
    } catch (e) {
      console.warn("stopScanIfRunning error", e);
    }
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  };

  // connect event handlers for notifications
  const onConnected = (info: any) => {
    console.log("[Settings] BLE connected:", info);
    // do not spam users on auto connects
    // Alert.alert("BLE", "Connected to device.");
  };
  const onDisconnected = (info: any) => {
    console.log("[Settings] BLE disconnected:", info);
    // Alert.alert("BLE", "Device disconnected.");
  };

  // Auto-connect effect — try connecting to any paired devices if autoConnect true
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      if (!autoConnect) return;

      try {
        (bleManager as any).on?.("connected", onConnected);
        (bleManager as any).on?.("disconnected", onDisconnected);

        // Attempt connects for paired devices (best-effort)
        const tryConnect = async (id?: string) => {
          if (!id) return;
          try {
            if ((bleManager as any)?.connectToDevice) {
              await (bleManager as any).connectToDevice(id);
            } else if ((bleManager as any)?.connect) {
              await (bleManager as any).connect?.();
            }
          } catch (e) {
            console.warn("Auto-connect single device failed", e);
          }
        };

        // Dog is primary — attempt first
        await tryConnect(pairedDevices.dog?.id);
        // then human & vest (optional)
        await tryConnect(pairedDevices.human?.id);
        await tryConnect(pairedDevices.vest?.id);
      } catch (e) {
        console.warn("Auto-connect failed", e);
      }
    })();

    return () => {
      mounted = false;
      try {
        (bleManager as any).off?.("connected", onConnected);
        (bleManager as any).off?.("disconnected", onDisconnected);
      } catch (e) {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, pairedDevices]);

  // Manual sync
  const handleManualSync = async () => {
    Alert.alert("Sync", "Attempting to sync with paired device (stub)...");
    console.log("[Settings] manualSync invoked");
    try {
      if ((bleManager as any)?.requestData) {
        await (bleManager as any).requestData();
      } else if ((bleManager as any)?.sync) {
        await (bleManager as any).sync();
      } else if ((bleManager as any)?.readBatteryAndHR) {
        await (bleManager as any).readBatteryAndHR();
      } else {
        console.warn("bleManager.sync / requestData not implemented");
        Alert.alert("Sync", "BLE manager does not implement a sync method (stub).");
      }
      setTimeout(() => Alert.alert("Sync", "Sync complete (stub)."), 700);
    } catch (e) {
      console.warn("manualSync failed", e);
      Alert.alert("Sync", "Sync failed (see console for details).");
    }
  };

  // Pair device flow (kept for backward compatibility, default to dog)
  const handlePairDevice = async () => {
    try {
      startScanFor("dog", 4000);
      Alert.alert("Scanning", "Scanning for nearby BLE devices for 4 seconds...");
    } catch (e) {
      console.warn("handlePairDevice error", e);
      Alert.alert("Error", "Failed to start BLE scan (see console).");
    }
  };

  // Unassign a specific device type
  const handleUnassign = async (type: "dog" | "human" | "vest") => {
    try {
      // attempt disconnect if bleManager supports it
      try {
        if ((bleManager as any)?.disconnect) {
          await (bleManager as any).disconnect();
        }
      } catch (e) {
        console.warn("disconnect failed", e);
      }

      const next = { ...(pairedDevices || {}) } as any;
      if (type === "dog") delete next.dog;
      if (type === "human") delete next.human;
      if (type === "vest") delete next.vest;
      setPairedDevices(next);
      await persist();
      Alert.alert("Device", `${type} device unassigned.`);
    } catch (e) {
      console.warn("handleUnassign failed", e);
      Alert.alert("Error", "Failed to unassign device.");
    }
  };

  // Export / Reset
  const handleExportData = async () => {
    Alert.alert("Export", "Exporting data (stub).");
    console.log("[Settings] export requested");
  };

  const handleResetAssignments = async () => {
    Alert.alert("Reset", "Reset all assignments and settings?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.removeItem(STORAGE_KEY);
          } catch (e) {
            /* noop */
          }
          setName("");
          setRole("human");
          setPairedDevices({});
          setAutoConnect(true);
          setKeepBleAlive(false);
          setUnitsMetric(true);
          setNotificationsEnabled(true);
          setHrAlertEnabled(false);
          setHrAlertThreshold("140");
          setAutoSync(true);
          setShareData(false);
          setThemeDog(true);
          Alert.alert("Reset", "Settings have been reset.");
        },
      },
    ]);
  };

  const handleOpenSdkDocs = () => {
    const url = "https://example.com/runmefit-sdk-docs"; // placeholder
    Linking.openURL(url).catch(() => {
      Alert.alert("Open", "Unable to open SDK docs — implement URL.");
    });
  };

  // small helper
  const numericOnly = (text: string) => text.replace(/[^0-9]/g, "");

  // ---------- RENDER ----------
  return (
    <ScrollView contentContainerStyle={[ui.container, { backgroundColor: theme.background }]} keyboardShouldPersistTaps="handled">
      <Text style={[ui.heading, { color: theme.textDark }]}>Settings</Text>
      <Text style={[ui.description, { color: theme.textMuted }]}>Configure your profile and device preferences</Text>

      {/* Profile */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Profile</Text>
        <Text style={[ui.label, { color: theme.textMuted }]}>Display name</Text>
        <TextInput
          style={[ui.textInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
          placeholder="Your name"
          placeholderTextColor={theme.textMuted}
          value={name}
          onChangeText={setName}
          returnKeyType="done"
        />
        <Text style={[ui.label, { marginTop: 12, color: theme.textMuted }]}>Role</Text>
        <View style={ui.row}>
          <TouchableOpacity
            style={[ui.roleBtn, role === "human" && { backgroundColor: theme.primary, borderColor: "transparent" }]}
            onPress={() => {
              setRole("human");
              persist();
            }}
          >
            <Text style={role === "human" ? ui.roleTextActive : [ui.roleText, { color: theme.textDark }]}>Me (Human)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              ui.roleBtn,
              role === "dog" && { backgroundColor: theme.primary, borderColor: "transparent", marginLeft: 8 },
              { marginLeft: role === "dog" ? 8 : 8 },
            ]}
            onPress={() => {
              setRole("dog");
              persist();
            }}
          >
            <Text style={role === "dog" ? ui.roleTextActive : [ui.roleText, { color: theme.textDark }]}>My Dog</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Devices (new multi-device UI) */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Devices</Text>

        {/* DOG (primary) */}
        <Text style={[ui.label, { color: theme.textMuted, marginTop: 6 }]}>Dog device (GTL1)</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[ui.valueText, { color: theme.textDark }]}>{pairedDevices.dog ? pairedDevices.dog.name : "Not paired"}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[ui.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => startScanFor("dog", 4000)}
            >
              <Text style={ui.primaryBtnText}>{pairedDevices.dog ? "Replace" : (scanning && scanTargetRef.current === "dog" ? "Scanning..." : "Pair")}</Text>
            </TouchableOpacity>

            {pairedDevices.dog ? (
              <TouchableOpacity
                style={[ui.secondaryBtn, { marginLeft: 10, backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={async () => {
                  try {
                    if ((bleManager as any)?.connectToDevice && pairedDevices.dog?.id) await (bleManager as any).connectToDevice(pairedDevices.dog.id);
                    else if ((bleManager as any)?.connect) await (bleManager as any).connect?.();
                  } catch (e) {
                    console.warn("connect dog failed", e);
                  }
                  Alert.alert("Connect", "Tried connecting to dog device (see console).");
                }}
              >
                <Text style={[ui.secondaryBtnText, { color: theme.textDark }]}>Connect</Text>
              </TouchableOpacity>
            ) : null}

            {pairedDevices.dog ? (
              <TouchableOpacity
                style={[ui.ghostBtn, { marginLeft: 8, borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => handleUnassign("dog")}
              >
                <Text style={[ui.ghostBtnText, { color: theme.orange }]}>Unassign</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* HUMAN */}
        <Text style={[ui.label, { color: theme.textMuted, marginTop: 12 }]}>Human device (GTS10)</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[ui.valueText, { color: theme.textDark }]}>{pairedDevices.human ? pairedDevices.human.name : "Not paired"}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[ui.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => startScanFor("human", 4000)}
            >
              <Text style={ui.primaryBtnText}>{pairedDevices.human ? "Replace" : (scanning && scanTargetRef.current === "human" ? "Scanning..." : "Pair")}</Text>
            </TouchableOpacity>

            {pairedDevices.human ? (
              <TouchableOpacity
                style={[ui.secondaryBtn, { marginLeft: 10, backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={async () => {
                  try {
                    if ((bleManager as any)?.connectToDevice && pairedDevices.human?.id) await (bleManager as any).connectToDevice(pairedDevices.human.id);
                    else if ((bleManager as any)?.connect) await (bleManager as any).connect?.();
                  } catch (e) {
                    console.warn("connect human failed", e);
                  }
                  Alert.alert("Connect", "Tried connecting to human device (see console).");
                }}
              >
                <Text style={[ui.secondaryBtnText, { color: theme.textDark }]}>Connect</Text>
              </TouchableOpacity>
            ) : null}

            {pairedDevices.human ? (
              <TouchableOpacity
                style={[ui.ghostBtn, { marginLeft: 8, borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => handleUnassign("human")}
              >
                <Text style={[ui.ghostBtnText, { color: theme.orange }]}>Unassign</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* VEST */}
        <Text style={[ui.label, { color: theme.textMuted, marginTop: 12 }]}>Therapy Vest (DogGPT)</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[ui.valueText, { color: theme.textDark }]}>{pairedDevices.vest ? pairedDevices.vest.name : "Not paired"}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[ui.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => startScanFor("vest", 4000)}
            >
              <Text style={ui.primaryBtnText}>{pairedDevices.vest ? "Replace" : (scanning && scanTargetRef.current === "vest" ? "Scanning..." : "Pair")}</Text>
            </TouchableOpacity>

            {pairedDevices.vest ? (
              <TouchableOpacity
                style={[ui.secondaryBtn, { marginLeft: 10, backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={async () => {
                  try {
                    if ((bleManager as any)?.connectToDevice && pairedDevices.vest?.id) await (bleManager as any).connectToDevice(pairedDevices.vest.id);
                    else if ((bleManager as any)?.connect) await (bleManager as any).connect?.();
                  } catch (e) {
                    console.warn("connect vest failed", e);
                  }
                  Alert.alert("Connect", "Tried connecting to vest (see console).");
                }}
              >
                <Text style={[ui.secondaryBtnText, { color: theme.textDark }]}>Connect</Text>
              </TouchableOpacity>
            ) : null}

            {pairedDevices.vest ? (
              <TouchableOpacity
                style={[ui.ghostBtn, { marginLeft: 8, borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => handleUnassign("vest")}
              >
                <Text style={[ui.ghostBtnText, { color: theme.orange }]}>Unassign</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <Text style={[ui.hint, { color: theme.textMuted, marginTop: 10 }]}>Tip: Dog device acts as the main tracker. Human and Vest are optional — pair them if you want extended data or control.</Text>
      </View>

      {/* Bluetooth & Connection */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Bluetooth & Connection</Text>

        <View style={ui.settingRow}>
          <Text style={[ui.settingLabel, { color: theme.textDark }]}>Auto-connect on start</Text>
          <Switch
            value={autoConnect}
            onValueChange={(v) => {
              setAutoConnect(v);
              persist();
            }}
            trackColor={{ true: theme.primary, false: undefined }}
            thumbColor={Platform.OS === "android" ? (autoConnect ? theme.primary : undefined) : undefined}
          />
        </View>

        <View style={ui.settingRow}>
          <Text style={[ui.settingLabel, { color: theme.textDark }]}>Keep BLE alive in background</Text>
          <Switch
            value={keepBleAlive}
            onValueChange={(v) => {
              setKeepBleAlive(v);
              persist();
            }}
            trackColor={{ true: theme.primary, false: undefined }}
            thumbColor={Platform.OS === "android" ? (keepBleAlive ? theme.primary : undefined) : undefined}
          />
        </View>

        <Text style={[ui.hint, { color: theme.textMuted }]}>On iOS enable Background Modes → Bluetooth to keep connections alive in background.</Text>
      </View>

      {/* Units */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Units</Text>
        <View style={ui.row}>
          <TouchableOpacity
            style={[ui.roleBtn, unitsMetric && { backgroundColor: theme.primary, borderColor: "transparent" }]}
            onPress={() => {
              setUnitsMetric(true);
              persist();
            }}
          >
            <Text style={unitsMetric ? ui.roleTextActive : [ui.roleText, { color: theme.textDark }]}>Metric</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ui.roleBtn, !unitsMetric && { backgroundColor: theme.primary, borderColor: "transparent", marginLeft: 8 }, { marginLeft: !unitsMetric ? 8 : 8 }]}
            onPress={() => {
              setUnitsMetric(false);
              persist();
            }}
          >
            <Text style={!unitsMetric ? ui.roleTextActive : [ui.roleText, { color: theme.textDark }]}>Imperial</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notifications & Alerts */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Notifications & Alerts</Text>

        <View style={ui.settingRow}>
          <Text style={[ui.settingLabel, { color: theme.textDark }]}>Enable notifications</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={(v) => {
              setNotificationsEnabled(v);
              persist();
            }}
            trackColor={{ true: theme.primary, false: undefined }}
            thumbColor={Platform.OS === "android" ? (notificationsEnabled ? theme.primary : undefined) : undefined}
          />
        </View>

        <View style={[ui.settingRow, { alignItems: "center" }]}>
          <Text style={[ui.settingLabel, { color: theme.textDark }]}>High heart-rate alert</Text>
          <Switch
            value={hrAlertEnabled}
            onValueChange={(v) => {
              setHrAlertEnabled(v);
              persist();
            }}
            trackColor={{ true: theme.primary, false: undefined }}
            thumbColor={Platform.OS === "android" ? (hrAlertEnabled ? theme.primary : undefined) : undefined}
          />
        </View>

        {hrAlertEnabled && (
          <View style={{ marginTop: 10 }}>
            <Text style={[ui.label, { color: theme.textMuted }]}>Threshold (bpm)</Text>
            <TextInput
              keyboardType="numeric"
              style={[ui.textInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
              value={hrAlertThreshold}
              onChangeText={(t) => setHrAlertThreshold(numericOnly(t))}
              onEndEditing={() => persist()}
              placeholder="140"
              placeholderTextColor={theme.textMuted}
            />
            <Text style={[ui.hint, { color: theme.textMuted }]}>Notifications will be delivered when measured HR &gt; threshold.</Text>
          </View>
        )}
      </View>

      {/* Sync */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Sync</Text>

        <View style={ui.settingRow}>
          <Text style={[ui.settingLabel, { color: theme.textDark }]}>Auto-sync</Text>
          <Switch
            value={autoSync}
            onValueChange={(v) => {
              setAutoSync(v);
              persist();
            }}
            trackColor={{ true: theme.primary, false: undefined }}
            thumbColor={Platform.OS === "android" ? (autoSync ? theme.primary : undefined) : undefined}
          />
        </View>

        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <TouchableOpacity style={[ui.primaryBtn, { backgroundColor: theme.primary }]} onPress={handleManualSync}>
            <Text style={ui.primaryBtnText}>Sync Now</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[ui.secondaryBtn, { marginLeft: 10, backgroundColor: theme.card, borderColor: theme.border }]} onPress={handleExportData}>
            <Text style={[ui.secondaryBtnText, { color: theme.textDark }]}>Export Data</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Privacy */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Privacy</Text>

        <View style={ui.settingRow}>
          <Text style={[ui.settingLabel, { color: theme.textDark }]}>Share anonymized data</Text>
          <Switch
            value={shareData}
            onValueChange={(v) => {
              setShareData(v);
              persist();
            }}
            trackColor={{ true: theme.primary, false: undefined }}
            thumbColor={Platform.OS === "android" ? (shareData ? theme.primary : undefined) : undefined}
          />
        </View>

        <Text style={[ui.hint, { color: theme.textMuted }]}>Sharing helps improve models. Revoke anytime.</Text>
      </View>

      {/* Theme */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Theme</Text>
        <View style={ui.row}>
          <TouchableOpacity
            style={[ui.roleBtn, themeDog && { backgroundColor: theme.primary, borderColor: "transparent" }]}
            onPress={() => {
              setThemeDog(true);
              persist();
            }}
          >
            <Text style={themeDog ? ui.roleTextActive : [ui.roleText, { color: theme.textDark }]}>Dog Theme</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[ui.roleBtn, !themeDog && { backgroundColor: theme.primary, borderColor: "transparent", marginLeft: 8 }, { marginLeft: !themeDog ? 8 : 8 }]}
            onPress={() => {
              setThemeDog(false);
              persist();
            }}
          >
            <Text style={!themeDog ? ui.roleTextActive : [ui.roleText, { color: theme.textDark }]}>Bond Theme</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SDK & Device Info */}
      <View style={ui.section}>
        <TouchableOpacity onPress={() => setSdkInfoCollapsed((s) => !s)}>
          <Text style={[ui.sectionTitle, { color: theme.textDark }]}>SDK & Device Info</Text>
        </TouchableOpacity>

        {!sdkInfoCollapsed && (
          <View style={{ marginTop: 8 }}>
            <Text style={[ui.hint, { color: theme.textMuted }]}>Runmefit SDK: GTS10/GTL1 support (STBleManager...)</Text>
            <TouchableOpacity style={[ui.secondaryBtn, { marginTop: 12, backgroundColor: theme.card, borderColor: theme.border }]} onPress={handleOpenSdkDocs}>
              <Text style={[ui.secondaryBtnText, { color: theme.textDark }]}>Open SDK Documentation</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={ui.section}>
        <TouchableOpacity style={[ui.ghostBtn, { borderColor: theme.border, backgroundColor: theme.card }]} onPress={handleResetAssignments}>
          <Text style={[ui.ghostBtnText, { color: theme.orange }]}>Reset assignments & settings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[ui.primaryBtn, { marginTop: 12, backgroundColor: "#444" }]}
          onPress={() => {
            persist();
            Alert.alert("Saved", "All preferences saved.");
          }}
        >
          <Text style={ui.primaryBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

// ---------------- UI styles (layout only) ----------------
const ui = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 40,
    // backgroundColor applied inline via theme
  },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 6 },
  description: { marginBottom: 12 },

  section: {
    marginTop: 16,
    paddingTop: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    // border color applied inline via theme where needed
  },
  sectionTitle: { fontWeight: "700", marginBottom: 8 },

  label: { fontSize: 13, marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },

  row: { flexDirection: "row", alignItems: "center" },
  roleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    // borderColor applied inline
    backgroundColor: "transparent",
  },
  roleBtnActive: {
    // kept for backwards compatibility if needed
  },
  roleText: { fontWeight: "600" },
  roleTextActive: { color: "#fff", fontWeight: "700" },

  valueText: { fontSize: 15 },

  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },

  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: "600" },

  ghostBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  ghostBtnText: { fontWeight: "700" },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 8,
  },
  settingLabel: { fontSize: 15 },

  hint: { marginTop: 8, fontSize: 12 },
});

// small helper
const numericOnly = (text: string) => text.replace(/[^0-9]/g, "");
