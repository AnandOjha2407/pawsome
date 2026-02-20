// src/screens/Settings.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { bleManager } from "../ble/BLEManager";
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";
import { SETTINGS_STORAGE_KEY } from "../storage/constants";
import { loadPairedDevices, savePairedDevice } from "../storage/pairedDevices";
import OnboardingTutorial from "../components/OnboardingTutorial";
import { usePageOnboarding } from "../hooks/usePageOnboarding";
import { useFirebase } from "../context/FirebaseContext";
import { TutorialStep } from "../components/OnboardingTutorial";
import * as Updates from "expo-updates";
import { writeDeviceConfig, loadDeviceConfig, PROTOCOLS } from "../firebase/firebase";

/**
 * Settings screen with lightweight BLE integration.
 * Theme-aware: uses theme tokens from useTheme()
 */

const STORAGE_KEY = SETTINGS_STORAGE_KEY;

export default function Settings() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  // Onboarding
  const { showOnboarding, completeOnboarding } = usePageOnboarding("settings");

  // Hold paired devices separately (dog = Polar H10, human = Polar H10, vest = PossumBond-Vest)
  const [pairedDevices, setPairedDevices] = useState<{
    dog?: { id?: string; name?: string | null };
    human?: { id?: string; name?: string | null };
    vest?: { id?: string; name?: string | null };
  }>({});

  const [autoConnect, setAutoConnect] = useState<boolean>(true);
  const [stressAlertsEnabled, setStressAlertsEnabled] = useState<boolean>(true);
  const [stressThreshold, setStressThreshold] = useState<string>("90");
  const [loading, setLoading] = useState<boolean>(true);
  const [autoCalmEnabled, setAutoCalmEnabled] = useState<boolean>(false);
  const [autoCalmThreshold, setAutoCalmThreshold] = useState<string>("70");
  const [autoCalmProtocol, setAutoCalmProtocol] = useState<number>(1);
  const [autoCalmIntensity, setAutoCalmIntensity] = useState<number>(3);

  // Settings tutorial steps
  const SETTINGS_TUTORIAL_STEPS: TutorialStep[] = [
    {
      id: "settings-intro",
      title: "Customize Your Experience",
      description:
        "Manage your device connections, adjust preferences, and customize your Pawsome experience. Configure auto-connect, stress alerts, and device settings to match your needs.",
      screen: "settings",
    },
  ];


  const router = useRouter();
  const firebase = useFirebase();
  const [firebaseDeviceId, setFirebaseDeviceId] = useState<string>("");
  useFocusEffect(
    useCallback(() => {
      if (firebase?.deviceId) setFirebaseDeviceId(firebase.deviceId);
    }, [firebase?.deviceId])
  );

  useEffect(() => {
    let mounted = true;
    if (!firebase?.deviceId) return;
    loadDeviceConfig(firebase.deviceId)
      .then((config) => {
        if (mounted && config) {
          setAutoCalmEnabled(config.enabled);
          setAutoCalmThreshold(String(config.threshold));
          setAutoCalmProtocol(config.defaultProtocol);
          setAutoCalmIntensity(config.defaultIntensity);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [firebase?.deviceId]);
  const [connectionSnapshot, setConnectionSnapshot] = useState<
    ReturnType<typeof bleManager.getConnections> | undefined
  >(bleManager.getConnections?.());

  // ---------- load saved settings ----------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mounted) {
          const parsed = JSON.parse(raw);
          setPairedDevices(parsed.pairedDevices ?? {});
          setAutoConnect(parsed.autoConnect ?? true);
          setStressAlertsEnabled(parsed.stressAlertsEnabled ?? true);
          setStressThreshold(parsed.stressThreshold ?? "90");
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
      try {
        (bleManager as any)?.off?.("connected", onConnected);
        (bleManager as any)?.off?.("disconnected", onDisconnected);
      } catch (e) {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      
      // Safety: Wrap in try-catch to prevent crashes
      try {
        loadPairedDevices().then((map) => {
          if (active && map) {
            setPairedDevices(map);
          }
        }).catch((e) => {
          console.warn("[Settings] Failed to load paired devices:", e);
        });

        // Safety: Check if getConnections exists before calling
        if (bleManager && typeof bleManager.getConnections === "function") {
          try {
            const snapshot = bleManager.getConnections();
            if (snapshot && active) {
              setConnectionSnapshot(snapshot);
            }
          } catch (e) {
            console.warn("[Settings] Failed to get connections:", e);
          }
        }
      } catch (e) {
        console.warn("[Settings] Error in useFocusEffect:", e);
      }

      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    // Safety: Check if event emitter methods exist
    if (!bleManager || typeof (bleManager as any).on !== "function") {
      return;
    }

    const handler = (snapshot: any) => {
      try {
        setConnectionSnapshot(snapshot);
      } catch (e) {
        console.warn("[Settings] Error in connections handler:", e);
      }
    };

    try {
      (bleManager as any).on("connections", handler);
    } catch (e) {
      console.warn("[Settings] Failed to register connections listener:", e);
    }

    return () => {
      try {
        if (bleManager && typeof (bleManager as any).off === "function") {
          (bleManager as any).off("connections", handler);
        }
      } catch (e) {
        console.warn("[Settings] Failed to unregister connections listener:", e);
      }
    };
  }, []);

  // persist helper (stores all settings)
  const persist = async () => {
    const payload = {
      pairedDevices,
      autoConnect,
      stressAlertsEnabled,
      stressThreshold,
    };
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Settings: failed to save", e);
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
  // FIXED: Added safety checks, delay, and prevents crashes
  useEffect(() => {
    let mounted = true;
    let connectionTimeout: NodeJS.Timeout | null = null;

    (async () => {
      if (!mounted) return;
      if (!autoConnect) return;

      // CRITICAL: Delay auto-connect to prevent crash on Settings screen mount
      // Wait for screen to fully mount and BLE manager to be ready
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!mounted) return;

      try {
        // Safety check: Verify BLE manager exists
        if (!bleManager || !(bleManager as any).manager) {
          console.warn("[Settings] BLE manager not ready, skipping auto-connect");
          return;
        }

        // Safety check: Check if already connected to avoid duplicate connections
        const currentConnections = bleManager.getConnections?.();
        if (currentConnections?.connected?.dog && pairedDevices.dog?.id) {
          console.log("[Settings] Dog device already connected, skipping");
        }
        if (currentConnections?.connected?.human && pairedDevices.human?.id) {
          console.log("[Settings] Human device already connected, skipping");
        }
        if (currentConnections?.connected?.vest && pairedDevices.vest?.id) {
          console.log("[Settings] Vest device already connected, skipping");
        }

        (bleManager as any).on?.("connected", onConnected);
        (bleManager as any).on?.("disconnected", onDisconnected);

        // Attempt connects for paired devices (best-effort with safety checks)
        const tryConnect = async (id: string | undefined, name: string | null | undefined, type: "dog" | "human" | "vest") => {
          if (!id || !mounted) return;
          
          // Safety: Check if bleManager methods exist
          if (!bleManager || typeof bleManager.getConnections !== "function" || 
              typeof bleManager.assignDeviceType !== "function" || 
              typeof bleManager.connectToScannedDevice !== "function") {
            console.warn(`[Settings] BLE manager methods not available for ${type}`);
            return;
          }

          try {
            // Check if already connected
            const connections = bleManager.getConnections();
            if (connections?.connected?.[type]) {
              console.log(`[Settings] ${type} device already connected, skipping`);
              return;
            }

            // Safety: Verify device ID is valid
            if (!id || id.length === 0) {
              console.warn(`[Settings] Invalid device ID for ${type}`);
              return;
            }

            bleManager.assignDeviceType(
              {
                id,
                name: name || `${type} Device`,
                mac: id,
                rssi: -60,
              },
              type
            );

            // Add small delay between connections to prevent overwhelming BLE stack
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (!mounted) return;

            await bleManager.connectToScannedDevice(
              {
                id,
                name: name || `${type} Device`,
                mac: id,
                rssi: -60,
              },
              type
            );
            console.log(`[Settings] Auto-connected ${type} device`);
          } catch (e: any) {
            // Log but don't crash - connection failures are expected
            console.warn(`[Settings] Auto-connect ${type} device failed:`, e?.message || e);
          }
        };

        // Dog is primary — attempt first
        if (mounted && pairedDevices.dog?.id) {
          await tryConnect(pairedDevices.dog.id, pairedDevices.dog.name, "dog");
        }
        
        // Add delay between device connections
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!mounted) return;

        // then human & vest (optional)
        if (mounted && pairedDevices.human?.id) {
          await tryConnect(pairedDevices.human.id, pairedDevices.human.name, "human");
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!mounted) return;

        if (mounted && pairedDevices.vest?.id) {
          await tryConnect(pairedDevices.vest.id, pairedDevices.vest.name, "vest");
        }
      } catch (e: any) {
        // Critical: Never let auto-connect crash the Settings screen
        console.warn("[Settings] Auto-connect error (non-fatal):", e?.message || e);
      }
    })();

    return () => {
      mounted = false;
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      try {
        (bleManager as any).off?.("connected", onConnected);
        (bleManager as any).off?.("disconnected", onDisconnected);
      } catch (e) {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, pairedDevices]);


  const openPairingManager = (type: "dog" | "human" | "vest") => {
    try {
      router.push({ pathname: "/pairing", params: { target: type } });
    } catch (e) {
      console.warn("navigation to pairing failed", e);
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
      await savePairedDevice(type, undefined);
      await persist();
      Alert.alert("Device", `${type} device unassigned.`);
    } catch (e) {
      console.warn("handleUnassign failed", e);
      Alert.alert("Error", "Failed to unassign device.");
    }
  };

  const handleResetAssignments = async () => {
    Alert.alert("Reset", "Reset all device pairings and settings?", [
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
          setPairedDevices({});
          setAutoConnect(true);
          setStressAlertsEnabled(true);
          setStressThreshold("90");
          Alert.alert("Reset", "Settings have been reset.");
        },
      },
    ]);
  };

  // Helper to validate numeric input
  const numericOnly = (text: string) => text.replace(/[^0-9]/g, "");

  // Manual update check
  const checkForUpdates = async () => {
    try {
      // Check if updates are enabled
      if (!Updates.isEnabled) {
        Alert.alert(
          "Updates Not Available",
          "Updates are only available in production/preview builds. Development builds don't support OTA updates.\n\nTo get updates:\n1. Build with: eas build --profile preview\n2. Install that build on your device\n3. Then updates will work automatically."
        );
        return;
      }

      // Check if we're in development mode
      if (__DEV__) {
        Alert.alert(
          "Development Mode",
          "You're running in development mode. Updates only work in production/preview builds.\n\nTo test updates:\n1. Build with: eas build --profile preview\n2. Install that build\n3. Updates will work automatically on app launch."
        );
        return;
      }

      Alert.alert("Checking for updates...", "Please wait...");
      
      const update = await Updates.checkForUpdateAsync();
      
      if (update.isAvailable) {
        Alert.alert(
          "Update Available",
          "A new update is available. Would you like to download it now?",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Download",
              onPress: async () => {
                try {
                  await Updates.fetchUpdateAsync();
                  Alert.alert(
                    "Update Downloaded",
                    "The update has been downloaded. Restart the app to apply it.",
                    [
                      {
                        text: "Restart Now",
                        onPress: async () => {
                          await Updates.reloadAsync();
                        },
                      },
                      { text: "Later", style: "cancel" },
                    ]
                  );
                } catch (error: any) {
                  Alert.alert("Error", `Failed to download update: ${error?.message || "Unknown error"}`);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert("No Updates", "You're already on the latest version!");
      }
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      
      // Provide helpful error messages
      if (errorMessage.includes("rejected") || errorMessage.includes("not available")) {
        Alert.alert(
          "Updates Not Available",
          "Updates are only available in production/preview builds installed from EAS Build.\n\nIf you're using a development build or Expo Go, updates won't work.\n\nTo enable updates:\n1. Run: eas build --profile preview\n2. Install the generated APK/IPA\n3. Updates will work automatically on app launch."
        );
      } else {
        Alert.alert("Error", `Failed to check for updates: ${errorMessage}`);
      }
    }
  };

  // ---------- RENDER ----------
  return (
    <ScrollView 
      contentContainerStyle={[
        ui.container, 
        { 
          backgroundColor: theme.background,
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: Math.max(insets.bottom, 20),
        }
      ]} 
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[ui.heading, { color: theme.textDark }]}>Settings</Text>
      <Text style={[ui.description, { color: theme.textMuted }]}>Manage your devices and preferences</Text>

      {/* Device (v1: single harness for BLE WiFi provisioning) */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Device</Text>
        <Text style={[ui.label, { color: theme.textMuted, marginTop: 6 }]}>PawsomeBond Harness</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <View>
            <Text style={[ui.valueText, { color: theme.textDark }]}>{pairedDevices.vest ? pairedDevices.vest.name : "Not paired"}</Text>
            <Text style={{ color: connectionSnapshot?.connected?.vest ? theme.primary : theme.textMuted, fontSize: 12, marginTop: 2 }}>
              {connectionSnapshot?.connected?.vest ? "Connected" : "Not connected"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <TouchableOpacity
              style={[ui.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => openPairingManager("vest")}
            >
              <Text style={ui.primaryBtnText}>{pairedDevices.vest ? "Manage" : "Pair"}</Text>
            </TouchableOpacity>
            {pairedDevices.vest ? (
              <TouchableOpacity
                style={[ui.secondaryBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={async () => {
                  try {
                    if (!bleManager || typeof bleManager.assignDeviceType !== "function" || typeof bleManager.connectToScannedDevice !== "function") {
                      Alert.alert("Error", "Bluetooth manager not available");
                      return;
                    }
                    if (pairedDevices.vest?.id) {
                      bleManager.assignDeviceType(
                        { id: pairedDevices.vest.id, name: pairedDevices.vest.name || "Harness", mac: pairedDevices.vest.id, rssi: -60 },
                        "vest"
                      );
                      await bleManager.connectToScannedDevice(
                        { id: pairedDevices.vest.id, name: pairedDevices.vest.name || "Harness", mac: pairedDevices.vest.id, rssi: -60 },
                        "vest"
                      );
                      Alert.alert("Connected", "Harness connected.");
                    } else Alert.alert("Error", "No device paired.");
                  } catch (e: any) {
                    Alert.alert("Error", `Failed to connect: ${e?.message || String(e)}`);
                  }
                }}
              >
                <Text style={[ui.secondaryBtnText, { color: theme.textDark }]}>{connectionSnapshot?.connected?.vest ? "Reconnect" : "Connect"}</Text>
              </TouchableOpacity>
            ) : null}
            {pairedDevices.vest ? (
              <TouchableOpacity style={[ui.ghostBtn, { borderColor: theme.border, backgroundColor: theme.card }]} onPress={() => handleUnassign("vest")}>
                <Text style={[ui.ghostBtnText, { color: theme.orange }]}>Unassign</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <Text style={[ui.hint, { color: theme.textMuted, marginTop: 10 }]}>BLE is used for WiFi provisioning only. Live data will come from Firebase.</Text>

        <Text style={[ui.label, { color: theme.textMuted, marginTop: 16 }]}>Firebase Device ID</Text>
        <Text style={[ui.hint, { color: theme.textMuted, marginTop: 4 }]}>Required for live data and remote commands (e.g. PB-A3F2). Get from Darian after harness connects to cloud.</Text>
        <TextInput
          style={[ui.textInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark, marginTop: 8 }]}
          value={firebaseDeviceId || firebase?.deviceId || ""}
          onChangeText={setFirebaseDeviceId}
          placeholder="e.g. PB-A3F2"
          placeholderTextColor={theme.textMuted}
          onBlur={async () => {
            const id = (firebaseDeviceId || firebase?.deviceId || "").trim();
            if (id && firebase?.setDeviceId) {
              await firebase.setDeviceId(id);
            }
          }}
        />
        <TouchableOpacity
          style={[ui.secondaryBtn, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 8 }]}
          onPress={async () => {
            const id = (firebaseDeviceId || firebase?.deviceId || "").trim();
            if (id && firebase?.setDeviceId) {
              await firebase.setDeviceId(id);
              Alert.alert("Saved", "Device ID saved. Live data will load if harness is streaming.");
            }
          }}
        >
          <Text style={[ui.secondaryBtnText, { color: theme.textDark }]}>Save Device ID</Text>
        </TouchableOpacity>
      </View>

      {/* Connection Settings */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Connection</Text>

        <View style={ui.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[ui.settingLabel, { color: theme.textDark }]}>Auto-connect on start</Text>
            <Text style={[ui.hint, { color: theme.textMuted, marginTop: 4 }]}>Automatically connect to paired devices when app opens</Text>
          </View>
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
      </View>

      {/* Auto-Calm */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Auto-Calm</Text>
        <Text style={[ui.hint, { color: theme.textMuted, marginBottom: 8 }]}>
          When anxiety score exceeds the threshold, automatically start a therapy session.
        </Text>
        <View style={ui.settingRow}>
          <Text style={[ui.settingLabel, { color: theme.textDark }]}>Auto-Calm on</Text>
          <Switch
            value={autoCalmEnabled}
            onValueChange={(v) => {
              setAutoCalmEnabled(v);
              if (firebase?.deviceId) writeDeviceConfig(firebase.deviceId, { enabled: v }).catch(() => {});
            }}
            trackColor={{ true: theme.primary, false: undefined }}
            thumbColor={Platform.OS === "android" ? (autoCalmEnabled ? theme.primary : undefined) : undefined}
          />
        </View>
        {autoCalmEnabled && (
          <>
            <Text style={[ui.label, { color: theme.textMuted, marginTop: 12 }]}>Threshold (0–100)</Text>
            <TextInput
              keyboardType="numeric"
              style={[ui.textInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark, marginTop: 6 }]}
              value={autoCalmThreshold}
              onChangeText={(t) => setAutoCalmThreshold(numericOnly(t))}
              onBlur={() => {
                const n = Math.min(100, Math.max(0, parseInt(autoCalmThreshold, 10) || 70));
                setAutoCalmThreshold(String(n));
                if (firebase?.deviceId) writeDeviceConfig(firebase.deviceId, { threshold: n }).catch(() => {});
              }}
              placeholder="70"
              placeholderTextColor={theme.textMuted}
            />
            <Text style={[ui.label, { color: theme.textMuted, marginTop: 12 }]}>Default protocol</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {PROTOCOLS.slice(0, 8).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => {
                    setAutoCalmProtocol(p.id);
                    if (firebase?.deviceId) writeDeviceConfig(firebase.deviceId, { defaultProtocol: p.id }).catch(() => {});
                  }}
                  style={[
                    { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
                    autoCalmProtocol === p.id ? { backgroundColor: theme.primary, borderColor: theme.primary } : { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Text style={{ color: autoCalmProtocol === p.id ? "#000" : theme.textDark, fontSize: 12, fontWeight: "600" }}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[ui.label, { color: theme.textMuted, marginTop: 12 }]}>Default intensity (1–5)</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    setAutoCalmIntensity(i);
                    if (firebase?.deviceId) writeDeviceConfig(firebase.deviceId, { defaultIntensity: i }).catch(() => {});
                  }}
                  style={[
                    { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1 },
                    autoCalmIntensity === i ? { backgroundColor: theme.primary, borderColor: theme.primary } : { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Text style={{ color: autoCalmIntensity === i ? "#000" : theme.textDark, fontWeight: "700" }}>{i}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Alerts & Notifications */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>Alerts & Notifications</Text>

        <View style={ui.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[ui.settingLabel, { color: theme.textDark }]}>Stress alerts</Text>
            <Text style={[ui.hint, { color: theme.textMuted, marginTop: 4 }]}>Get notified when dog's heart rate indicates stress</Text>
          </View>
          <Switch
            value={stressAlertsEnabled}
            onValueChange={(v) => {
              setStressAlertsEnabled(v);
              persist();
            }}
            trackColor={{ true: theme.primary, false: undefined }}
            thumbColor={Platform.OS === "android" ? (stressAlertsEnabled ? theme.primary : undefined) : undefined}
          />
        </View>

        {stressAlertsEnabled && (
          <View style={{ marginTop: 12 }}>
            <Text style={[ui.label, { color: theme.textMuted }]}>Stress threshold (BPM)</Text>
            <TextInput
              keyboardType="numeric"
              style={[ui.textInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark, marginTop: 6 }]}
              value={stressThreshold}
              onChangeText={(t) => setStressThreshold(numericOnly(t))}
              onEndEditing={() => persist()}
              placeholder="90"
              placeholderTextColor={theme.textMuted}
            />
            <Text style={[ui.hint, { color: theme.textMuted, marginTop: 4 }]}>Alert when dog's heart rate exceeds this value</Text>
          </View>
        )}
      </View>

      {/* App Updates */}
      <View style={ui.section}>
        <Text style={[ui.sectionTitle, { color: theme.textDark }]}>App Updates</Text>
        <TouchableOpacity 
          style={[ui.primaryBtn, { backgroundColor: theme.primary, marginTop: 8 }]} 
          onPress={checkForUpdates}
        >
          <Text style={[ui.primaryBtnText, { color: theme.textOnPrimary }]}>Check for Updates</Text>
        </TouchableOpacity>
        <Text style={[ui.hint, { color: theme.textMuted, marginTop: 8 }]}>
          The app automatically checks for updates on launch. Tap here to check manually.
        </Text>
      </View>

      {/* Sign out */}
      <View style={ui.section}>
        <TouchableOpacity
          style={[ui.ghostBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
          onPress={async () => {
            try {
              await firebase?.signOut();
            } catch (e) {
              console.warn("Sign out failed", e);
            }
          }}
        >
          <Text style={[ui.ghostBtnText, { color: theme.orange }]}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Actions */}
      <View style={ui.section}>
        <TouchableOpacity style={[ui.ghostBtn, { borderColor: theme.border, backgroundColor: theme.card }]} onPress={handleResetAssignments}>
          <Text style={[ui.ghostBtnText, { color: theme.orange }]}>Reset all settings</Text>
        </TouchableOpacity>
      </View>

      {/* Onboarding Tutorial */}
      <OnboardingTutorial
        steps={SETTINGS_TUTORIAL_STEPS}
        visible={showOnboarding}
        onComplete={completeOnboarding}
      />
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


  valueText: { fontSize: 15 },

  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { fontWeight: "700" },

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
  label: { fontSize: 13, marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },
});
