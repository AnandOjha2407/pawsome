// src/screens/Dashboard.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { bleManager, THERAPY } from "../ble/BLEManager";
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";
import OnboardingTutorial from "../components/OnboardingTutorial";
import { usePageOnboarding } from "../hooks/usePageOnboarding";
import { tutorialMeasurementRegistry } from "../utils/tutorialMeasurement";
import { TutorialStep } from "../components/OnboardingTutorial";

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
  const insets = useSafeAreaInsets();

  // Tab state: "collar", "vest", "human"
  const [selectedTab, setSelectedTab] = useState<"collar" | "vest" | "human">("collar");

  // Local state for each profile
  const [collarData, setCollarData] = useState({
    heartRate: 0,
    steps: 0,
    battery: 0,
    spO2: 0,
    hr7: [0, 0, 0, 0, 0, 0, 0],
    steps7: [0, 0, 0, 0, 0, 0, 0],
  });

  const [humanData, setHumanData] = useState({
    heartRate: 0,
    battery: 0,
    strain: 0,
  });

  const [vestData, setVestData] = useState({
    battery: 0,
  });

  // Connection states
  const [vestConnected, setVestConnected] = useState(false);
  const [collarConnected, setCollarConnected] = useState(false);
  const [humanConnected, setHumanConnected] = useState(false);

  const [isTraining, setIsTraining] = useState(false);

  // Therapy mode state
  const [currentTherapyMode, setCurrentTherapyMode] = useState<number | null>(null);
  const [intensity, setIntensity] = useState(128); // Default 50% (128/255)

  // Onboarding
  const { showOnboarding, completeOnboarding } = usePageOnboarding("dashboard");
  const tabSwitcherRef = useRef<View>(null);

  // Heart pulse animation
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

  // Listen for therapy mode changes
  useEffect(() => {
    const handleTherapyModeChange = (data: any) => {
      try {
        if (data && typeof data === 'object' && data.mode !== undefined) {
          setCurrentTherapyMode(data.mode);
        }
      } catch (e: any) {
        console.warn("Error handling therapy mode change:", e);
      }
    };

    try {
      if (bleManager && typeof bleManager.on === "function") {
        bleManager.on("therapy_mode_changed", handleTherapyModeChange);
      }
    } catch (e: any) {
      console.warn("Error setting up therapy mode listener:", e);
    }

    return () => {
      try {
        if (bleManager && typeof bleManager.off === "function") {
          bleManager.off("therapy_mode_changed", handleTherapyModeChange);
        }
      } catch (e: any) {
        console.warn("Error removing therapy mode listener:", e);
      }
    };
  }, []);

  // Register tutorial measurement for device tabs
  useEffect(() => {
    tutorialMeasurementRegistry.register("dashboard-devices", async () => {
      return new Promise((resolve) => {
        // Use a small delay to ensure layout is complete
        setTimeout(() => {
          try {
            if (tabSwitcherRef.current) {
              tabSwitcherRef.current.measureInWindow((x, y, width, height) => {
                try {
                  // Add extra margin around the buttons for better highlighting
                  // Adjust y position to move highlight lower
                  const margin = 8;
                  const yOffset = 20; // Move highlight lower
                  resolve({
                    x: x - margin,
                    y: y - margin + yOffset,
                    width: width + margin * 2,
                    height: (height || 50) + margin * 2,
                  });
                } catch (err) {
                  console.warn("Error in measureInWindow callback:", err);
                  resolve({ x: 0, y: 0, width: 200, height: 50 });
                }
              });
            } else {
              // Fallback if ref is not available
              resolve({ x: 0, y: 0, width: 200, height: 50 });
            }
          } catch (err) {
            console.warn("Error measuring dashboard devices:", err);
            resolve({ x: 0, y: 0, width: 200, height: 50 });
          }
        }, 100);
      });
    });

    return () => {
      tutorialMeasurementRegistry.unregister("dashboard-devices");
    };
  }, []);

  // Dashboard tutorial steps
  const DASHBOARD_TUTORIAL_STEPS: TutorialStep[] = [
    {
      id: "dashboard-devices",
      title: "Check Device Connections",
      description:
        "Check out the 3 devices on top - Collar, Vest, and Human. Switch between them to track each device's connection status and monitor their health metrics.",
      screen: "dashboard",
    },
  ];

  // Mount ref to prevent setState after unmount
  const isMountedRef = useRef(true);

  // Load initial BLE state & Listeners
  useEffect(() => {
    isMountedRef.current = true;

    // 1. Initial State Check
    try {
      const s = bleManager.getState?.() || {};
    } catch (e) {
      console.warn("Error getting initial BLE state:", e);
    }

    const onData = (data: any) => {
      // Safety: Check if component is still mounted before setState
      if (!isMountedRef.current) return;

      try {
        if (!data || typeof data !== 'object') return;

        if (data.profile === "dog") {
          setCollarConnected(true);
          setCollarData((prev) => {
            if (!isMountedRef.current) return prev; // Don't update if unmounted
            // Safety: Ensure prev exists
            const safePrev = prev || { heartRate: 0, steps: 0, battery: 0, spO2: 0, hr7: [0, 0, 0, 0, 0, 0, 0], steps7: [0, 0, 0, 0, 0, 0, 0] };

            // Validate and update data from actual device
            const newHeartRate = (typeof data.heartRate === 'number' && data.heartRate > 0 && data.heartRate < 300) ? data.heartRate : safePrev.heartRate;
            const newBattery = (typeof data.battery === 'number' && data.battery >= 0 && data.battery <= 100) ? data.battery : safePrev.battery;
            const newSpO2 = (typeof data.spO2 === 'number' && data.spO2 >= 0 && data.spO2 <= 100) ? data.spO2 : safePrev.spO2;

            return {
              ...safePrev,
              heartRate: newHeartRate,
              steps: (typeof data.steps === 'number' && data.steps >= 0) ? data.steps : safePrev.steps,
              battery: newBattery,
              spO2: newSpO2,
              hr7: Array.isArray(data.hrHistory) && data.hrHistory.length > 0
                ? data.hrHistory.slice(0, 7)
                : (Array.isArray(safePrev.hr7) ? safePrev.hr7 : [0, 0, 0, 0, 0, 0, 0]),
            };
          });
        }

        if (data.profile === "human") {
          setHumanConnected(true);
          setHumanData((prev) => {
            if (!isMountedRef.current) return prev; // Don't update if unmounted
            // Safety: Ensure prev exists
            const safePrev = prev || { heartRate: 0, battery: 0, strain: 0 };

            // Validate and update data from actual device
            const newHeartRate = (typeof data.heartRate === 'number' && data.heartRate > 0 && data.heartRate < 300) ? data.heartRate : safePrev.heartRate;
            const newBattery = (typeof data.battery === 'number' && data.battery >= 0 && data.battery <= 100) ? data.battery : safePrev.battery;
            const newStrain = (typeof data.strainScore === 'number' && data.strainScore >= 0 && data.strainScore <= 100) ? data.strainScore : safePrev.strain;

            return {
              ...safePrev,
              heartRate: newHeartRate,
              battery: newBattery,
              strain: newStrain,
            };
          });
        }

        if (data.profile === "vest") {
          console.log(`[Dashboard] Received vest data:`, JSON.stringify(data));
          setVestConnected(true);
          setVestData((prev) => {
            if (!isMountedRef.current) return prev; // Don't update if unmounted
            // Safety: Ensure prev exists
            const safePrev = prev || { battery: 0 };

            // Validate and update battery from vest
            const newBattery = (typeof data.battery === 'number' && data.battery >= 0 && data.battery <= 100) ? data.battery : safePrev.battery;

            console.log(`[Dashboard] Vest battery update: ${safePrev.battery} -> ${newBattery}`);

            return {
              ...safePrev,
              battery: newBattery,
            };
          });
        }
      } catch (error: any) {
        console.warn("Error processing BLE data in Dashboard:", error?.message ?? error);
        // Don't crash - just log the error
      }
    };

    const onConnections = (conns: any) => {
      // Safety: Check if component is still mounted before setState
      if (!isMountedRef.current) return;

      try {
        if (conns && typeof conns === 'object' && conns.connected) {
          setCollarConnected(!!conns.connected.dog);
          setHumanConnected(!!conns.connected.human);
          setVestConnected(!!conns.connected.vest);
        }
      } catch (error: any) {
        console.warn("Error processing connection data in Dashboard:", error?.message ?? error);
        // Don't crash - just log the error
      }
    };

    // Attach listeners with error handling
    try {
      if (bleManager && typeof bleManager.on === "function") {
        bleManager.on("data", onData);
        bleManager.on("connections", onConnections);
      }
    } catch (error: any) {
      console.warn("Error setting up BLE listeners in Dashboard:", error?.message ?? error);
    }

    // Trigger initial connection read
    try {
      if (bleManager && typeof bleManager.getConnections === "function") {
        const initConns = bleManager.getConnections();
        if (initConns && isMountedRef.current) {
          onConnections(initConns);
        }
      }
    } catch (error: any) {
      console.warn("Error reading initial connections in Dashboard:", error?.message ?? error);
    }

    return () => {
      isMountedRef.current = false;
      try {
        if (bleManager && typeof bleManager.off === "function") {
          bleManager.off("data", onData);
          bleManager.off("connections", onConnections);
        }
      } catch (error: any) {
        console.warn("Error removing BLE listeners in Dashboard:", error?.message ?? error);
      }
    };
  }, []);

  // Actions
  const startTraining = () => {
    try {
      setIsTraining(true);
      if (bleManager && typeof bleManager.startTrainingSession === "function") {
        bleManager.startTrainingSession();
      }
    } catch (e: any) {
      console.warn("Error starting training:", e);
      setIsTraining(false); // Revert state on error
    }
  };

  const stopTraining = () => {
    try {
      setIsTraining(false);
      if (bleManager && typeof bleManager.stopTrainingSession === "function") {
        bleManager.stopTrainingSession();
      }
    } catch (e: any) {
      console.warn("Error stopping training:", e);
      setIsTraining(false); // Ensure state is updated
    }
  };

  // Send therapy command
  const sendTherapyCommand = async (commandCode: number, name: string) => {
    try {
      if (!vestConnected) {
        Alert.alert(
          "Vest Not Connected",
          "Please connect the PAWSOMEBOND-VEST device first."
        );
        return;
      }

      if (!bleManager || typeof bleManager.sendTherapyCommand !== "function") {
        Alert.alert("Error", "Bluetooth manager not available");
        return;
      }

      const success = await bleManager.sendTherapyCommand(commandCode);

      if (success) {
        setCurrentTherapyMode(commandCode);
        // Don't show alert for every button press to avoid spam
        console.log(`Therapy command sent: ${name} (0x${commandCode.toString(16).padStart(2, '0')})`);
      } else {
        Alert.alert("Failed", `Could not send ${name} command. Please try again.`);
      }
    } catch (e: any) {
      console.error("Error sending therapy command:", e);
      Alert.alert("Error", `Failed to send ${name}: ${e?.message || "Unknown error"}`);
    }
  };

  // Set intensity
  const handleIntensityChange = async (value: number) => {
    try {
      const newIntensity = Math.round(value);
      setIntensity(newIntensity);

      if (!vestConnected) {
        console.warn("Vest not connected, intensity change not sent");
        return;
      }

      if (!bleManager || typeof bleManager.setVestIntensity !== "function") {
        console.warn("BLE manager not available for intensity change");
        return;
      }

      const success = await bleManager.setVestIntensity(newIntensity);
      if (!success) {
        console.warn(`Failed to set intensity to ${newIntensity}`);
      } else {
        console.log(`✓ Intensity set to ${newIntensity} (${Math.round((newIntensity / 255) * 100)}%)`);
      }
    } catch (e: any) {
      console.error("Error setting intensity:", e);
      // Don't show alert - just log, intensity is non-critical
    }
  };

  const sendCue = async (type: "vibrate" | "beep" | "tone") => {
    // Legacy method - map to therapy commands
    if (type === "vibrate") {
      await sendTherapyCommand(THERAPY.MASSAGE, "Massage");
    } else {
      await sendTherapyCommand(THERAPY.CALM, "Calm");
    }
  };

  const avg = (arr: number[]) =>
    arr && arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  // --- Render Helpers ---

  const renderTabButton = (key: "collar" | "vest" | "human", label: string) => {
    const isActive = selectedTab === key;
    return (
      <TouchableOpacity
        onPress={() => setSelectedTab(key)}
        style={{
          flex: 1,
          paddingVertical: 10,
          backgroundColor: isActive ? theme.primary : theme.card,
          borderRadius: 8,
          alignItems: "center",
          borderWidth: 1,
          borderColor: isActive ? theme.primary : theme.border,
        }}
      >
        <Text
          style={{
            color: isActive ? theme.textOnPrimary : theme.textMuted,
            fontWeight: "700",
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  /* 1. COLLAR VIEW */
  const renderCollarView = () => (
    <View style={{ gap: 18 }}>
      {/* Top Stats */}
      <View style={styles.topRow}>
        <LinearGradient
          colors={[theme.card, theme.cardElevated]}
          style={[styles.largeCard, { borderColor: theme.border, borderWidth: 1 }]}
        >
          <Text style={[styles.cardTitle, { color: theme.textMuted }]}>Heart Rate</Text>
          <Animated.View
            style={[
              styles.heartWrap,
              { transform: [{ scale: heartPulse }], backgroundColor: theme.softPrimary },
            ]}
          >
            <FontAwesome5 name="heart" size={36} color={theme.primary} />
          </Animated.View>
          <Text
            style={[
              styles.hrText,
              { color: collarConnected ? theme.textDark : theme.textMuted },
            ]}
          >
            {collarConnected ? `${collarData.heartRate} bpm` : "--"}
          </Text>
          <Text style={[styles.smallLabel, { color: theme.textMuted, marginTop: 8 }]}>
            {collarConnected ? "Live" : "Disconnected"}
          </Text>
        </LinearGradient>

        <LinearGradient
          colors={[theme.card, theme.cardElevated]}
          style={[styles.statCard, { borderColor: theme.border, borderWidth: 1 }]}
        >
          <Text style={[styles.cardTitle, { color: theme.textMuted }]}>Steps</Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: collarConnected ? theme.textDark : theme.textMuted,
              marginTop: 8,
            }}
          >
            {collarConnected ? (collarData.steps || 0) : 0}
          </Text>
          <Text style={{ color: theme.textMuted, marginTop: 10, fontSize: 12 }}>
            Daily Total
          </Text>
        </LinearGradient>
      </View>

      {/* Battery & SpO2 */}
      <View style={styles.stackedRow}>
        <View style={{ borderRadius: 12, padding: 14, backgroundColor: theme.card }}>
          <Text style={{ color: theme.textMuted, fontWeight: "700" }}>Battery</Text>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: theme.textDark,
              marginTop: 4,
            }}
          >
            {collarData.battery || 0}%
          </Text>
        </View>
        <View style={{ borderRadius: 12, padding: 14, backgroundColor: theme.card }}>
          <Text style={{ color: theme.textMuted, fontWeight: "700" }}>SpO₂</Text>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: theme.textDark,
              marginTop: 4,
            }}
          >
            {collarData.spO2 || 0}%
          </Text>
        </View>
      </View>

      {/* Graphs */}
      <LinearGradient
        colors={[theme.card, theme.cardElevated]}
        style={[styles.cardLargeGraph, { borderColor: theme.border, borderWidth: 1 }]}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text style={{ fontWeight: "800", color: theme.textDark }}>
            7-day Heart Rate
          </Text>
          <Text style={{ fontWeight: "800", color: theme.textDark }}>
            {avg(collarData.hr7)} bpm avg
          </Text>
        </View>
        <SevenDayBarChart
          data={collarData.hr7}
          colors={theme.gradientColors}
          height={100}
          labelColor={theme.textMuted}
        />
      </LinearGradient>

      {/* Training controls */}
      <View>
        <Text style={[styles.sectionLabel, { color: theme.textDark }]}>Session</Text>
        <TouchableOpacity
          onPress={() => (isTraining ? stopTraining() : startTraining())}
          style={{
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isTraining ? theme.orange : theme.primary,
          }}
        >
          <Text
            style={{ color: theme.textOnPrimary, fontWeight: "800", fontSize: 16 }}
          >
            {isTraining ? "Stop Training" : "Start Training"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  /* 2. VEST VIEW - Therapy Controls */
  const renderVestView = () => {
    // Get therapy mode name
    const getTherapyModeName = (mode: number | null): string => {
      if (mode === null) return "";
      const modeMap: Record<number, string> = {
        [THERAPY.STOP]: "Stopped",
        [THERAPY.CALM]: "Calm",
        [THERAPY.THUNDER]: "Thunder",
        [THERAPY.SEPARATION]: "Separation",
        [THERAPY.SLEEP]: "Sleep",
        [THERAPY.TRAVEL]: "Travel",
        [THERAPY.VET_VISIT]: "Vet Visit",
        [THERAPY.REWARD]: "Good Boy!",
        [THERAPY.BOND_SYNC]: "Bond Sync",
        [THERAPY.LIGHT_ONLY]: "Light Therapy",
        [THERAPY.MASSAGE]: "Massage",
        [THERAPY.EMERGENCY]: "Emergency",
        [THERAPY.WAKE]: "Wake",
        [THERAPY.PLAY]: "Play Time",
      };
      return modeMap[mode] || "Unknown";
    };

    // Therapy button component
    const TherapyButton = ({
      code,
      name,
      icon,
      color,
      onPress
    }: {
      code: number;
      name: string;
      icon: string;
      color: string;
      onPress: () => void;
    }) => (
      <TouchableOpacity
        onPress={() => {
          try {
            if (!vestConnected) {
              Alert.alert("Vest Not Connected", "Please connect the PAWSOMEBOND-VEST device first.");
              return;
            }
            onPress();
          } catch (e: any) {
            console.error(`Error pressing ${name} button:`, e);
            Alert.alert("Error", `Failed to send ${name} command. Please try again.`);
          }
        }}
        disabled={!vestConnected}
        style={{
          width: (screenW - 60) / 3, // 3 columns with gaps
          padding: 14,
          borderRadius: 12,
          backgroundColor: currentTherapyMode === code ? color : theme.card,
          borderWidth: 2,
          borderColor: currentTherapyMode === code ? color : theme.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: vestConnected ? 1 : 0.5,
          minHeight: 90,
        }}
      >
        <Text style={{ fontSize: 26, marginBottom: 6 }}>{icon}</Text>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "700",
            color: currentTherapyMode === code ? "#ffffff" : (vestConnected ? theme.textDark : theme.textMuted),
            textAlign: "center",
          }}
          numberOfLines={2}
        >
          {name}
        </Text>
      </TouchableOpacity>
    );

    return (
      <View style={{ gap: 24 }}>
        {/* Mini HR Display */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: "#00d4ff" }}>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 6 }}>Your HR</Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: "#00d4ff" }}>
              {humanConnected && humanData.heartRate > 0 ? `${humanData.heartRate} bpm` : "--"}
            </Text>
            {humanConnected && humanData.battery > 0 && (
              <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>
                🔋 {humanData.battery}%
              </Text>
            )}
          </View>
          <View style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: "#a855f7" }}>
            <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 6 }}>Dog HR</Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color: "#a855f7" }}>
              {collarConnected && collarData.heartRate > 0 ? `${collarData.heartRate} bpm` : "--"}
            </Text>
            {collarConnected && collarData.battery > 0 && (
              <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>
                🔋 {collarData.battery}%
              </Text>
            )}
          </View>
        </View>

        {/* Vest Battery Display */}
        <View style={{ padding: 14, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: vestConnected ? "#22c55e" : theme.border }}>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginBottom: 6 }}>Vest Battery</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 14 }}>🔋</Text>
            <Text style={{ fontSize: 20, fontWeight: "800", color: vestConnected ? "#22c55e" : theme.textMuted }}>
              {vestConnected && vestData.battery > 0 ? `${vestData.battery}%` : "--"}
            </Text>
            {!vestConnected && (
              <Text style={{ fontSize: 10, color: theme.textMuted, marginLeft: 4 }}>
                (Disconnected)
              </Text>
            )}
          </View>
        </View>

        {/* Active Mode Banner */}
        {currentTherapyMode !== null && currentTherapyMode !== THERAPY.STOP && (
          <LinearGradient
            colors={["#00d4ff", "#a855f7"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              padding: 16,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, color: theme.textMuted, marginBottom: 4 }}>Active Mode</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#ffffff" }}>
              {getTherapyModeName(currentTherapyMode)}
            </Text>
          </LinearGradient>
        )}

        {/* Intensity Slider */}
        <View style={{ padding: 18, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: theme.textDark }}>Intensity</Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: theme.primary }}>
              {Math.round((intensity / 255) * 100)}%
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[50, 100, 150, 200, 255].map((val) => (
              <TouchableOpacity
                key={val}
                onPress={() => {
                  try {
                    handleIntensityChange(val);
                  } catch (e: any) {
                    console.error("Error setting intensity:", e);
                    Alert.alert("Error", "Failed to set intensity. Please try again.");
                  }
                }}
                disabled={!vestConnected}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 10,
                  backgroundColor: intensity === val ? theme.primary : theme.glassBackground,
                  borderWidth: 2,
                  borderColor: intensity === val ? theme.primary : theme.border,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: vestConnected ? 1 : 0.5,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: intensity === val ? theme.textOnPrimary : theme.textDark }}>
                  {Math.round((val / 255) * 100)}%
                </Text>
                <Text style={{ fontSize: 10, color: intensity === val ? theme.textOnPrimary : theme.textMuted, marginTop: 2 }}>
                  {val}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 10, textAlign: "center" }}>
            Range: 50-255 (sends to VEST_INTENSITY)
          </Text>
        </View>

        {/* Quick Actions Section */}
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.sectionLabel, { color: theme.textDark, marginBottom: 14 }]}>
            Quick Actions
          </Text>
          <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
            <TherapyButton
              code={THERAPY.CALM}
              name="Calm"
              icon="😌"
              color="#22c55e"
              onPress={() => sendTherapyCommand(THERAPY.CALM, "Calm")}
            />
            <TherapyButton
              code={THERAPY.REWARD}
              name="Good Boy!"
              icon="🎉"
              color="#f59e0b"
              onPress={() => sendTherapyCommand(THERAPY.REWARD, "Good Boy!")}
            />
            <TherapyButton
              code={THERAPY.EMERGENCY}
              name="Emergency"
              icon="🆘"
              color="#dc2626"
              onPress={() => sendTherapyCommand(THERAPY.EMERGENCY, "Emergency")}
            />
          </View>
        </View>

        {/* Anxiety & Stress Section */}
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.sectionLabel, { color: theme.textDark, marginBottom: 14 }]}>
            Anxiety & Stress
          </Text>
          <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
            <TherapyButton
              code={THERAPY.THUNDER}
              name="Thunder"
              icon="⛈️"
              color="#8b5cf6"
              onPress={() => sendTherapyCommand(THERAPY.THUNDER, "Thunder")}
            />
            <TherapyButton
              code={THERAPY.SEPARATION}
              name="Separation"
              icon="💔"
              color="#ec4899"
              onPress={() => sendTherapyCommand(THERAPY.SEPARATION, "Separation")}
            />
            <TherapyButton
              code={THERAPY.VET_VISIT}
              name="Vet Visit"
              icon="🏥"
              color="#06b6d4"
              onPress={() => sendTherapyCommand(THERAPY.VET_VISIT, "Vet Visit")}
            />
            <TherapyButton
              code={THERAPY.TRAVEL}
              name="Travel"
              icon="🚗"
              color="#f97316"
              onPress={() => sendTherapyCommand(THERAPY.TRAVEL, "Travel")}
            />
          </View>
        </View>

        {/* Wellness Section */}
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.sectionLabel, { color: theme.textDark, marginBottom: 14 }]}>
            Wellness
          </Text>
          <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
            <TherapyButton
              code={THERAPY.SLEEP}
              name="Sleep"
              icon="😴"
              color="#6366f1"
              onPress={() => sendTherapyCommand(THERAPY.SLEEP, "Sleep")}
            />
            <TherapyButton
              code={THERAPY.LIGHT_ONLY}
              name="Light"
              icon="🔴"
              color="#dc2626"
              onPress={() => sendTherapyCommand(THERAPY.LIGHT_ONLY, "Light")}
            />
            <TherapyButton
              code={THERAPY.MASSAGE}
              name="Massage"
              icon="💆"
              color="#14b8a6"
              onPress={() => sendTherapyCommand(THERAPY.MASSAGE, "Massage")}
            />
            <TherapyButton
              code={THERAPY.WAKE}
              name="Wake"
              icon="🌅"
              color="#fbbf24"
              onPress={() => sendTherapyCommand(THERAPY.WAKE, "Wake")}
            />
          </View>
        </View>

        {/* Bonding Section - Larger Buttons */}
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.sectionLabel, { color: theme.textDark, marginBottom: 14 }]}>
            Bonding
          </Text>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <TouchableOpacity
              onPress={() => {
                try {
                  sendTherapyCommand(THERAPY.BOND_SYNC, "Bond Sync");
                } catch (e: any) {
                  console.error("Error sending Bond Sync command:", e);
                  Alert.alert("Error", "Failed to send Bond Sync command. Please try again.");
                }
              }}
              disabled={!vestConnected}
              style={{
                flex: 1,
                padding: 18,
                borderRadius: 12,
                backgroundColor: currentTherapyMode === THERAPY.BOND_SYNC ? "#f43f5e" : theme.card,
                borderWidth: 2,
                borderColor: currentTherapyMode === THERAPY.BOND_SYNC ? "#f43f5e" : theme.border,
                alignItems: "center",
                opacity: vestConnected ? 1 : 0.5,
                minHeight: 100,
              }}
            >
              <Text style={{ fontSize: 36, marginBottom: 10 }}>💓</Text>
              <Text style={{ fontSize: 14, fontWeight: "800", color: currentTherapyMode === THERAPY.BOND_SYNC ? "#ffffff" : theme.textDark }}>
                Bond Sync
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                try {
                  sendTherapyCommand(THERAPY.PLAY, "Play Time");
                } catch (e: any) {
                  console.error("Error sending Play command:", e);
                  Alert.alert("Error", "Failed to send Play command. Please try again.");
                }
              }}
              disabled={!vestConnected}
              style={{
                flex: 1,
                padding: 18,
                borderRadius: 12,
                backgroundColor: currentTherapyMode === THERAPY.PLAY ? "#84cc16" : theme.card,
                borderWidth: 2,
                borderColor: currentTherapyMode === THERAPY.PLAY ? "#84cc16" : theme.border,
                alignItems: "center",
                opacity: vestConnected ? 1 : 0.5,
                minHeight: 100,
              }}
            >
              <Text style={{ fontSize: 36, marginBottom: 10 }}>🎾</Text>
              <Text style={{ fontSize: 14, fontWeight: "800", color: currentTherapyMode === THERAPY.PLAY ? "#ffffff" : theme.textDark }}>
                Play Time
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  /* 3. HUMAN VIEW */
  const renderHumanView = () => (
    <View style={{ gap: 18 }}>
      <View
        style={{
          padding: 18,
          borderRadius: 14,
          backgroundColor: theme.card,
          borderWidth: 1,
          borderColor: theme.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontSize: 18, fontWeight: "800", color: theme.textDark }}>
            Handler Profile
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: humanConnected ? theme.green : theme.textMuted,
            }}
          >
            {humanConnected ? "Device Active" : "No Device"}
          </Text>
        </View>
        <MaterialIcons name="person" size={40} color={theme.textMuted} />
      </View>

      <View style={styles.topRow}>
        <LinearGradient
          colors={[theme.card, theme.cardElevated]}
          style={[styles.largeCard, { borderColor: theme.border, borderWidth: 1 }]}
        >
          <Text style={[styles.cardTitle, { color: theme.textMuted }]}>
            Your Heart Rate
          </Text>
          <View style={{ marginVertical: 14 }}>
            <FontAwesome5 name="heartbeat" size={32} color={theme.red} />
          </View>
          <Text
            style={[
              styles.hrText,
              { color: humanConnected ? theme.textDark : theme.textMuted },
            ]}
          >
            {humanConnected ? `${humanData.heartRate} bpm` : "--"}
          </Text>
        </LinearGradient>

        <View style={{ flex: 1, gap: 12 }}>
          <View
            style={{
              flex: 1,
              borderRadius: 12,
              padding: 12,
              backgroundColor: theme.card,
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 12, color: theme.textMuted }}>
              Stress / Strain
            </Text>
            <Text
              style={{ fontSize: 18, fontWeight: "800", color: theme.textDark }}
            >
              {humanData.strain || 0}/100
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              borderRadius: 12,
              padding: 12,
              backgroundColor: theme.card,
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 12, color: theme.textMuted }}>Battery</Text>
            <Text
              style={{ fontSize: 18, fontWeight: "800", color: theme.textDark }}
            >
              {humanData.battery || 0}%
            </Text>
          </View>
        </View>
      </View>

      <Text
        style={{ color: theme.textMuted, fontSize: 13, paddingHorizontal: 4 }}
      >
        Monitoring your own biometrics helps understand how your state affects your
        dog's behavior during training sessions.
      </Text>
    </View>
  );

  // ---------- Main Render ---------- //
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 10) }]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.textDark }]}>Dashboard</Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View
          ref={tabSwitcherRef}
          collapsable={false}
          onLayout={() => {
            // Trigger re-measurement when layout changes
          }}
          style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}
        >
          {renderTabButton("collar", "Collar")}
          {renderTabButton("vest", "Vest")}
          {renderTabButton("human", "Human")}
        </View>

        {/* Content Area */}
        {selectedTab === "collar" && renderCollarView()}
        {selectedTab === "vest" && renderVestView()}
        {selectedTab === "human" && renderHumanView()}

        {/* Small debug/footer */}
        <View style={{ marginTop: 40, marginBottom: 20, alignItems: "center" }}>
          <Text style={{ color: theme.textMuted, fontSize: 10 }}>
            DOGGPT v1.0.0 · Bond AI
          </Text>
        </View>
      </ScrollView>

      {/* Onboarding Tutorial */}
      <OnboardingTutorial
        steps={DASHBOARD_TUTORIAL_STEPS}
        visible={showOnboarding}
        onComplete={completeOnboarding}
      />
    </SafeAreaView>
  );
}
