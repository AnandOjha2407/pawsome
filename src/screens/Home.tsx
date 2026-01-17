// src/screens/Home.tsx
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";
import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Alert,
  Pressable,
  Animated,
  TouchableOpacity,
  Platform,
  Modal,
  SafeAreaView,
  AccessibilityInfo,
  Easing,
  Switch,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MaterialIcons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import { bleManager, THERAPY } from "../ble/BLEManager";
import Constants from "expo-constants";
import Svg, { Circle, G } from "react-native-svg";
import { Animated as RNAnimated } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import OnboardingTutorial from "../components/OnboardingTutorial";
import { useOnboarding } from "../hooks/useOnboarding";
import { TUTORIAL_STEPS } from "../config/tutorialSteps";
import { tutorialMeasurementRegistry } from "../utils/tutorialMeasurement";
const AnimatedG = RNAnimated.createAnimatedComponent(G);

type Props = { navigation?: any; route?: any };
const screenW = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

/* ---------- Static assets (ensure these exist) ---------- */
// Avatar placeholder removed - using icon-based UI instead

/* ---------- Small helpers ---------- */
function AnimatedButton({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(
      (r) => (reduceMotionRef.current = r)
    );
  }, []);

  const pressIn = () => {
    if (reduceMotionRef.current) return;
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      friction: 6,
    }).start();
  };
  const pressOut = () => {
    if (reduceMotionRef.current) return;
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={({ pressed }) => [{ opacity: pressed ? 0.96 : 1 }]}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/* Dot indicator used by carousel */
function Dots({
  count,
  index,
  theme,
}: {
  count: number;
  index: Animated.Value;
  theme: Theme;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const inputRange = [i - 1, i, i + 1];
        const dotScale = index.interpolate({
          inputRange,
          outputRange: [1, 1.45, 1],
          extrapolate: "clamp",
        });
        const opacity = index.interpolate({
          inputRange,
          outputRange: [0.5, 1, 0.5],
          extrapolate: "clamp",
        });
        return (
          <Animated.View
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              backgroundColor: theme.textDark,
              transform: [{ scale: dotScale }],
              opacity,
              marginHorizontal: 4,
              borderWidth: 0.5,
              borderColor: theme.border,
            }}
          />
        );
      })}
    </View>
  );
}

/* ---------- Styles factory ---------- */
function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingTop: Platform.OS === "ios" ? 48 : 20,
      paddingHorizontal: 18,
      paddingBottom: 14,
      backgroundColor: theme.background,
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    logoPlaceholder: {
      width: 48,
      height: 48,
      marginRight: 10,
      borderRadius: 14,
      backgroundColor: theme.glassBackground,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.primary,
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    appName: { fontSize: 20, fontWeight: "700", color: theme.textDark },
    appSub: { fontSize: 12, color: theme.textMuted },

    content: { padding: 18, paddingBottom: 48 },
    parallaxBannerWrap: {
      width: screenW - 36,
      height: 190,
      borderRadius: 18,
      overflow: "hidden",
      alignSelf: "center",
      marginBottom: 20,
      borderWidth: 1,
      borderColor: theme.border,
      // backgroundColor: theme.card, // Replaced by gradient in render
    },
    parallaxBanner: { width: "100%", height: "100%", resizeMode: "cover" },

    heroSection: {
      borderRadius: 20,
      paddingVertical: 24,
      paddingHorizontal: 22,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 18,
      // backgroundColor: theme.card, // Replaced by gradient
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: "#000",
      shadowOpacity: 0.4,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    heroRow: { flexDirection: "row", alignItems: "center", gap: 16 },
    heroImage: {
      width: 110,
      height: 110,
      borderRadius: 18,
      marginBottom: 8,
      backgroundColor: theme.overlayLight,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: theme.textDark,
      marginBottom: 8,
      textAlign: "left",
    },
    heroSubtitle: {
      fontSize: 14,
      color: theme.textMuted,
      textAlign: "left",
      lineHeight: 20,
    },
    getStartedBtn: { marginTop: 14, borderRadius: theme.buttonRadius, overflow: "hidden" },
    getStartedInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: theme.primary,
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: theme.buttonRadius,
      shadowColor: theme.primary,
      shadowOpacity: 0.45,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    getStartedText: { color: theme.textOnPrimary, fontWeight: "800" },
    heroNote: {
      marginTop: 14,
      color: theme.textMuted,
      fontSize: 12,
      textAlign: "center",
    },

    deviceStrip: {
      marginTop: 12,
      marginBottom: 10,
      backgroundColor: theme.glassBackground,
      borderRadius: 16,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: theme.glassBorder,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    deviceLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    deviceName: { fontWeight: "700", color: theme.textDark },
    deviceMeta: { color: theme.textMuted, fontSize: 12 },

    onboardingWrap: {
      marginTop: 14,
      height: 240,
      borderRadius: 16,
      overflow: "hidden",
    },
    onboardingSlide: {
      width: screenW - 36,
      padding: 22,
      justifyContent: "center",
      alignItems: "center",
    },
    onboardingTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.textDark,
      marginBottom: 8,
    },
    onboardingText: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: "center",
    },

    featuresRow: { marginTop: 18, gap: 12 },
    featureCard: {
      // backgroundColor: theme.card, // Replaced by gradient
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    featureTitle: {
      fontWeight: "800",
      fontSize: 16,
      color: theme.textDark,
      marginBottom: 6,
    },
    featureText: { color: theme.textMuted, fontSize: 13 },

    trainingRow: {
      marginTop: 12,
      gap: 12,
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
    },
    trainingBtn: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: theme.buttonRadius,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 120,
    },
    deviceStatusRow: {
      flexDirection: "row",
      gap: 12,
      flexWrap: "wrap",
      alignItems: "center",
    },

    footer: {
      marginTop: 24,
      paddingVertical: 18,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: "transparent",
    },
    footerText: { color: theme.textMuted, fontSize: 12, textAlign: "center" },
  });
}

/* ---------- Device Details modal content ---------- */
function DeviceDetailsModal({
  visible,
  onClose,
  state,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  state: any;
  theme: Theme;
}) {
  const [mockOn, setMockOn] = useState<boolean>(!!state?.mockMode);
  useEffect(() => setMockOn(!!state?.mockMode), [state?.mockMode]);

  const toggleMock = async (v: boolean) => {
    setMockOn(v);
    try {
      bleManager.setMockMode?.(v);
      Alert.alert("Dev", `Mock mode ${v ? "enabled" : "disabled"}`);
    } catch (e) {
      console.warn(e);
    }
  };

  const sendCueLocal = async (type: "vibrate" | "beep" | "tone") => {
    try {
      // Check if vest is connected
      if (!bleManager?.isRoleConnected?.("vest")) {
        Alert.alert("Vest Not Connected", "Please connect the therapy vest first.");
        return;
      }

      // Use new sendTherapyCommand API
      let commandCode: number;
      if (type === "vibrate") {
        commandCode = THERAPY.MASSAGE; // Vibration only
      } else {
        commandCode = THERAPY.CALM; // Use calm for beep/tone
      }

      if (typeof bleManager.sendTherapyCommand === "function") {
        const success = await bleManager.sendTherapyCommand(commandCode);
        if (success) {
          Alert.alert("Comfort", `Sent ${type} cue`);
        } else {
          Alert.alert("Comfort", "Failed to send cue. Please try again.");
        }
      } else if (typeof bleManager.sendComfortSignal === "function") {
        // Fallback to legacy method
        const vibration = type === "vibrate" ? "gentle" : "pulse";
        await bleManager.sendComfortSignal("dog", { vibration });
        Alert.alert("Comfort", `Sent ${type} cue`);
      } else {
        Alert.alert("Error", "Cue function not available");
      }
    } catch (e: any) {
      console.warn("Send cue error:", e);
      Alert.alert("Comfort", `Failed to send cue: ${e?.message || "Unknown error"}`);
    }
  };

  const copyLogs = async () => {
    bleManager.emitLogs?.();
    const s = bleManager.getState?.() ?? {};
    const logs = s.logs ?? [];
    Alert.alert("Logs (last 5)", logs.slice(-5).join("\n") || "No logs");
  };

  const assignTo = (p: "human" | "dog") => {
    bleManager.assignProfile?.(p);
    Alert.alert("Assigned", `Device assigned to ${p}`);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            maxHeight: "82%",
            backgroundColor: theme.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 18,
            borderWidth: 1,
            borderColor: theme.border,
            shadowColor: "#000",
            shadowOpacity: 0.5,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: -4 },
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "800", fontSize: 16, color: theme.textDark }}>
              Device Details
            </Text>
            <Pressable onPress={onClose}>
              <MaterialIcons name="close" size={20} color={theme.textDark} />
            </Pressable>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: "700", color: theme.textDark }}>
              {state?.assignedProfile
                ? `${state.assignedProfile}`
                : "Unassigned"}
            </Text>
            <Text style={{ color: theme.textMuted, marginTop: 4 }}>
              {state?.isConnected ? "Connected" : "Not connected"}
            </Text>
            <Text style={{ color: theme.textMuted, marginTop: 6 }}>
              Battery: {(() => {
                try {
                  return state?.human?.battery ?? state?.dog?.battery ?? "--";
                } catch (e) {
                  return "--";
                }
              })()}%
            </Text>
            <Text style={{ color: theme.textMuted, marginTop: 2 }}>
              RSSI: {(() => {
                try {
                  return (state as any)?.rssi ?? (bleManager as any)?.rssi ?? "--";
                } catch (e) {
                  return "--";
                }
              })()}
            </Text>
            <Text style={{ color: theme.textMuted, marginTop: 2 }}>
              FW: {state?.firmwareVersion ?? "--"}
            </Text>
          </View>

          <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                try {
                  if (bleManager && typeof bleManager.manualFetch === "function") {
                    bleManager.manualFetch();
                  }
                } catch (e: any) {
                  console.warn("Manual fetch error:", e);
                }
              }}
              style={{
                backgroundColor: theme.softPrimary,
                padding: 10,
                borderRadius: theme.buttonRadius,
              }}
            >
              <Text style={{ color: theme.textDark, fontWeight: "600" }}>Force Sync</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => bleManager.connect?.()}
              style={{
                backgroundColor: theme.softPrimary,
                padding: 10,
                borderRadius: theme.buttonRadius,
              }}
            >
              <Text style={{ color: theme.textDark, fontWeight: "600" }}>Connect</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => bleManager.disconnect?.()}
              style={{
                backgroundColor: theme.softPrimary,
                padding: 10,
                borderRadius: theme.buttonRadius,
              }}
            >
              <Text style={{ color: theme.textDark, fontWeight: "600" }}>Disconnect</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={{ fontWeight: "700", marginBottom: 8, color: theme.textDark }}>Cues</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => sendCueLocal("vibrate")}
                style={{
                  padding: 10,
                  backgroundColor: theme.glassBackground,
                  borderRadius: theme.buttonRadius,
                  borderWidth: 1,
                  borderColor: theme.glassBorder,
                }}
              >
                <Text style={{ color: theme.textDark }}>Vibrate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => sendCueLocal("beep")}
                style={{
                  padding: 10,
                  backgroundColor: theme.glassBackground,
                  borderRadius: theme.buttonRadius,
                  borderWidth: 1,
                  borderColor: theme.glassBorder,
                }}
              >
                <Text style={{ color: theme.textDark }}>Beep</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => sendCueLocal("tone")}
                style={{
                  padding: 10,
                  backgroundColor: theme.glassBackground,
                  borderRadius: theme.buttonRadius,
                  borderWidth: 1,
                  borderColor: theme.glassBorder,
                }}
              >
                <Text style={{ color: theme.textDark }}>Tone</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={{
              marginTop: 14,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "700", color: theme.textDark }}>Developer mock mode</Text>
            <Switch value={mockOn} onValueChange={toggleMock} />
          </View>

          <View style={{ marginTop: 12, flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              onPress={copyLogs}
              style={{
                backgroundColor: theme.softPrimary,
                padding: 10,
                borderRadius: theme.buttonRadius,
              }}
            >
              <Text style={{ color: theme.textDark, fontWeight: "600" }}>Show Logs</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => assignTo("human")}
              style={{
                backgroundColor: theme.softPrimary,
                padding: 10,
                borderRadius: theme.buttonRadius,
              }}
            >
              <Text style={{ color: theme.textDark, fontWeight: "600" }}>Assign → Me</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => assignTo("dog")}
              style={{
                backgroundColor: theme.softPrimary,
                padding: 10,
                borderRadius: theme.buttonRadius,
              }}
            >
              <Text style={{ color: theme.textDark, fontWeight: "600" }}>Assign → Dog</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 20 }} />
        </View>
      </View>
    </Modal>
  );
}

/* ---------- AnimatedFeatureCard component ---------- */
function AnimatedFeatureCard({
  style,
  title,
  text,
  theme,
}: {
  style?: any;
  title: string;
  text: string;
  theme: Theme;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 650,
      delay: 120,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}
    >
      <LinearGradient
        colors={[theme.card, theme.cardElevated]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={{ padding: 16 }}>
        <Text
          style={{
            fontWeight: "800",
            fontSize: 16,
            color: theme.textDark,
            marginBottom: 6,
          }}
        >
          {title}
        </Text>
        <Text style={{ color: theme.textMuted }}>{text}</Text>
      </View>
    </Animated.View>
  );
}

/* ---------- Main Home component (simplified connect UX) ---------- */
export default function Home({ navigation }: Props) {
  // ---------- THREE RING DISPLAY WITH TRIANGULAR LAYOUT + CENTER ENLARGE ----------
  const router = useRouter();
  const { theme: activeTheme } = useTheme();
  const { showOnboarding, completeOnboarding } = useOnboarding();
  const insets = useSafeAreaInsets();

  // Refs for tutorial measurements
  const ringsContainerRef = useRef<View>(null);
  const [connectionState, setConnectionState] = useState<
    ReturnType<typeof bleManager.getConnections> | undefined
  >(() => {
    try {
      return bleManager.getConnections?.() ?? undefined;
    } catch (e) {
      return undefined;
    }
  });
  
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    
    const handler = (snapshot: any) => {
      if (!isMountedRef.current) return;
      try {
        setConnectionState(snapshot);
      } catch (e) {
        console.warn("Error updating connection state:", e);
      }
    };
    
    try {
      if (bleManager && typeof (bleManager as any).on === "function") {
        (bleManager as any).on("connections", handler);
      }
    } catch (e) {
      console.warn("Error setting up connections listener:", e);
    }
    
    return () => {
      isMountedRef.current = false;
      try {
        if (bleManager && typeof (bleManager as any).off === "function") {
          (bleManager as any).off("connections", handler);
        }
      } catch (e) {
        console.warn("Error removing connections listener:", e);
      }
    };
  }, []);
  const dogOnline = !!connectionState?.connected?.dog;
  const vestOnline = !!connectionState?.connected?.vest;

  const [ringScores, setRingScores] = useState({
    sleep: 0, // Bond
    recovery: 0, // Dog Health
    strain: 0, // Human Health
  });

  const [selected, setSelected] = useState<number | null>(null);

  // Register measurement callbacks for tutorial
  useEffect(() => {
    // Register rings measurement
    tutorialMeasurementRegistry.register("rings", async () => {
      return new Promise((resolve) => {
        try {
          if (ringsContainerRef.current) {
            ringsContainerRef.current.measureInWindow((x, y, width, height) => {
              try {
                resolve({ x, y, width, height: height || 300 });
              } catch (err) {
                console.warn("Error in measureInWindow callback:", err);
                resolve({ x: 0, y: 0, width: 200, height: 300 });
              }
            });
          } else {
            // Fallback if ref is not available
            resolve({ x: 0, y: 0, width: 200, height: 300 });
          }
        } catch (err) {
          console.warn("Error measuring rings:", err);
          resolve({ x: 0, y: 0, width: 200, height: 300 });
        }
      });
    });

    // Tutorial measurement registrations removed - simplified tutorial only highlights rings

    return () => {
      tutorialMeasurementRegistry.unregister("rings");
    };
  }, []);

  // BLE listener
  useEffect(() => {
    const fn = (data: any) => {
      try {
        if (!data || typeof data !== 'object') return;
        
        // Safety: Validate and clamp scores to valid range
        const sleep = typeof data.sleepScore === 'number' && data.sleepScore >= 0 && data.sleepScore <= 100 
          ? data.sleepScore 
          : 0;
        const recovery = typeof data.recoveryScore === 'number' && data.recoveryScore >= 0 && data.recoveryScore <= 100 
          ? data.recoveryScore 
          : 0;
        const strain = typeof data.strainScore === 'number' && data.strainScore >= 0 && data.strainScore <= 100 
          ? data.strainScore 
          : 0;
        
        setRingScores({
          sleep,
          recovery,
          strain,
        });
      } catch (error: any) {
        console.warn("Error processing BLE data in Home:", error?.message ?? error);
        // Don't crash - just log the error
      }
    };
    
    try {
      if (bleManager && typeof bleManager.on === "function") {
        bleManager.on("data", fn);
      }
    } catch (error: any) {
      console.warn("Error setting up BLE listener in Home:", error?.message ?? error);
    }
    
    return () => {
      try {
        if (bleManager && typeof bleManager.off === "function") {
          bleManager.off("data", fn);
        }
      } catch (error: any) {
        console.warn("Error removing BLE listener in Home:", error?.message ?? error);
      }
    };
  }, []);

  // sizes
  const baseSize = 125;
  const enlarge = 1.25;
  const stroke = 5;

  // glow
  const glow = useRef(new Animated.Value(0)).current;

  // ring scale
  const ringScale = [
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(1)).current,
  ];

  // ► NEW: Triangular layout target positions
  const TRI_POS: Record<number, { x: number; y: number }> = {
    0: { x: 0, y: -110 }, // Bond
    1: { x: -110, y: 50 }, // Dog
    2: { x: 110, y: 50 }, // Human
  };

  const CENTER = { x: 0, y: 0 };

  // ► NEW: Position animators (x,y per ring)
  const ringPos = [
    {
      x: useRef(new Animated.Value(TRI_POS[0].x)).current,
      y: useRef(new Animated.Value(TRI_POS[0].y)).current,
    },

    {
      x: useRef(new Animated.Value(TRI_POS[1].x)).current,
      y: useRef(new Animated.Value(TRI_POS[1].y)).current,
    },

    {
      x: useRef(new Animated.Value(TRI_POS[2].x)).current,
      y: useRef(new Animated.Value(TRI_POS[2].y)).current,
    },
  ];

  // Glow animation
  useEffect(() => {
    if (selected === null) return;
    glow.setValue(0);

    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => glow.stopAnimation();
  }, [selected]);

  // ► NEW: On-select logic
  function onSelect(i: number) {
    const now = i === selected ? null : i;
    setSelected(now);

    // Scale
    ringScale.forEach((scale, idx) => {
      Animated.timing(scale, {
        toValue: idx === now ? enlarge : 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
    });

    // Position (x,y)
    ringPos.forEach((pos, idx) => {
      Animated.timing(pos.x, {
        toValue: idx === now ? CENTER.x : TRI_POS[idx].x,
        duration: 260,
        useNativeDriver: true,
      }).start();
      Animated.timing(pos.y, {
        toValue: idx === now ? CENTER.y : TRI_POS[idx].y,
        duration: 260,
        useNativeDriver: true,
      }).start();
    });
  }

  // Suggestion logic
  function getSuggestion(i: number, v: number) {
    v = Number(v) || 0;

    if (i === 0) {
      if (v < 40)
        return "Bond is weak. Try calm interactions and shared routines.";
      if (v < 70)
        return "Bond is growing. Add more consistent play or training.";
      return "Bond is strong! Keep up your shared activities.";
    }

    if (i === 1) {
      if (v < 40) return "Dog health is low. Ensure hydration & rest.";
      if (v < 70) return "Dog health is average. Light walks are okay.";
      return "Dog health is great! Ideal time for longer walks or play.";
    }

    if (i === 2) {
      if (v < 40) return "Your health is low. Rest & hydrate.";
      if (v < 70)
        return "Your health is moderate. Light stretching recommended.";
      return "You're healthy! Great time for active play or workouts.";
    }

    return "";
  }

  // -------------------------------- RING COMPONENT --------------------------------
  function Ring({ i, label, value, color }: any) {
    const size = baseSize;
    const center = size / 2;
    const radius = center - stroke;
    const circ = 2 * Math.PI * radius;
    const offset = circ * (1 - value / 100);

    return (
      <Animated.View
        style={{
          position: "absolute",
          transform: [
            { translateX: ringPos[i].x },
            { translateY: ringPos[i].y },
            { scale: ringScale[i] },
          ],
          alignItems: "center",
        }}
      >
        <Pressable onPress={() => onSelect(i)}>
          {/* Glow */}
          {selected === i && (
            <Animated.View
              style={{
                position: "absolute",
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color + "33",
                transform: [
                  {
                    scale: glow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.22], // numeric only
                    }),
                  },
                ],
              }}
            />
          )}

          <Svg width={size} height={size}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="rgba(132, 132, 132, 0.2)"
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${center}, ${center}`}
            />
          </Svg>

          {/* Center text */}
          <View
            style={{
              position: "absolute",
              width: size,
              height: size,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: activeTheme.textDark, fontSize: 20, fontWeight: "900" }}>
              {value}%
            </Text>
            <Text style={{ color: activeTheme.textMuted, fontSize: 12 }}>
              {label}
            </Text>
          </View>
        </Pressable>

        {/* Suggestion bubble */}
        {selected === i && (
          <Animated.View
            style={{
              marginTop: 16,
              paddingVertical: 10,
              paddingHorizontal: 14,
              backgroundColor: activeTheme.glassBackground,
              borderRadius: 12,
              maxWidth: 280,
              width: 280,
              opacity: ringScale[i].interpolate({
                inputRange: [1, enlarge],
                outputRange: [0, 1],
              }),
              zIndex: 9999,
              elevation: 5,
              position: "absolute", // must be absolute
              top: size + 5, // appear below the ring
              left: "25%",
              transform: [{ translateX: -110 }], // center horizontally
              borderWidth: 1,
              borderColor: activeTheme.glassBorder,
            }}
          >
            <Text style={{ color: activeTheme.textDark, fontSize: 11, lineHeight: 18 }}>
              {getSuggestion(i, value)}
            </Text>
          </Animated.View>
        )}
      </Animated.View>
    );
  }

  // -------------------------------- FINAL TRIANGULAR DISPLAY -------------------------------

  const ThreeRingDisplay = (
    <View
      style={{
        width: 300,
        height: 330,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 10,
      }}
    >
      <Ring i={0} label="Bond Score" value={ringScores.sleep} color={activeTheme.secondary} />
      <Ring
        i={1}
        label="Dog Health"
        value={ringScores.recovery}
        color={activeTheme.primary}
      />
      <Ring
        i={2}
        label="Human Health"
        value={ringScores.strain}
        color={activeTheme.electric}
      />
    </View>
  );
  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  const styles = useMemo(() => createStyles(activeTheme), [activeTheme]);

  // parallax & anim
  const scrollY = useRef(new Animated.Value(0)).current;
  const carouselX = useRef(new Animated.Value(0)).current;
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselRef = useRef<ScrollView | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((r) => setReduceMotion(r));
  }, []);

  // Mascot / subtle pulse (non-critical)
  const mascotScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(mascotScale, {
          toValue: 1.06,
          duration: 900,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(mascotScale, {
          toValue: 1.0,
          duration: 900,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [mascotScale, reduceMotion]);

  const CAROUSEL_SLIDES = [
    {
      title: "Track & Train",
      text: "Real-time telemetry for your dog.",
      icon: <MaterialCommunityIcons name="pulse" size={42} color={activeTheme.textOnPrimary} />,
    },
    {
      title: "Smart Device",
      text: "Connect with your dog and track it's health",
      icon: (
        <MaterialCommunityIcons name="link-variant" size={42} color={activeTheme.textOnPrimary} />
      ),
    },
    {
      title: "BondAI Chat",
      text: "Ask BondAI for training tips, health insights.",
      icon: <MaterialIcons name="chat" size={42} color={activeTheme.textOnPrimary} />,
    },
  ];

  // Moments scroll
  const momentScrollX = useRef(new Animated.Value(0)).current;

  // deviceState (derived from bleManager)
  const [deviceState, setDeviceState] = useState<any>(
    (() => {
      try {
        return bleManager.getState?.() ?? { isConnected: false };
      } catch (e) {
        return { isConnected: false };
      }
    })()
  );
  const isMountedDeviceRef = useRef(true);
  
  useEffect(() => {
    isMountedDeviceRef.current = true;
    
    const update = () => {
      if (!isMountedDeviceRef.current) return;
      try {
        setDeviceState(bleManager.getState?.() ?? { isConnected: false });
      } catch (e) {
        console.warn("Error updating device state:", e);
      }
    };
    const onData = () => update();
    const onAssigned = () => update();
    const onLogs = () => update();
    
    try {
      if (bleManager && typeof bleManager.on === "function") {
        bleManager.on("data", onData);
        bleManager.on("assigned", onAssigned);
        bleManager.on("logs", onLogs);
        if (isMountedDeviceRef.current) {
          update();
        }
      }
    } catch (e) {
      console.warn("Error setting up BLE listeners:", e);
    }
    
    return () => {
      isMountedDeviceRef.current = false;
      try {
        if (bleManager && typeof bleManager.off === "function") {
          bleManager.off("data", onData);
          bleManager.off("assigned", onAssigned);
          bleManager.off("logs", onLogs);
        }
      } catch (e) {
        console.warn("Error removing BLE listeners:", e);
      }
    };
  }, []);

  // training state
  const [isTraining, setIsTraining] = useState(false);

  // device details modal
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);

  // carousel autoplayer
  useEffect(() => {
    let t: any;
    if (!reduceMotion) {
      t = setInterval(() => {
        const next = (carouselIndex + 1) % CAROUSEL_SLIDES.length;
        setCarouselIndex(next);
        carouselRef.current?.scrollTo({
          x: next * (screenW - 36),
          animated: true,
        });
      }, 5500);
    }
    return () => clearInterval(t);
  }, [carouselIndex, reduceMotion]);

  const onCarouselScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: carouselX } } }],
    {
      useNativeDriver: false,
      listener: (ev: any) => {
        const x = ev.nativeEvent.contentOffset.x;
        const i = Math.round(x / (screenW - 36));
        if (i !== carouselIndex) setCarouselIndex(i);
      },
    }
  );

  // training actions
  const startTraining = useCallback(() => {
    try {
      // Safety: Check if methods exist
      if (!bleManager || typeof bleManager.isRoleConnected !== "function") {
        Alert.alert("Error", "Bluetooth manager not available");
        return;
      }

      if (
        !bleManager.isRoleConnected("dog") ||
        !bleManager.isRoleConnected("vest")
      ) {
        Alert.alert(
          "Devices required",
          "Connect both the dog collar and therapy vest before starting a session."
        );
        return;
      }
      
      if (typeof bleManager.startTrainingSession === "function") {
        bleManager.startTrainingSession();
      }
      setIsTraining(true);
      
      if (typeof bleManager.sendComfortSignal === "function") {
        bleManager.sendComfortSignal("dog", { vibration: "gentle" });
      }
      Alert.alert("Training", "Training started.");
    } catch (e: any) {
      console.warn("Start training error:", e);
      Alert.alert("Error", `Failed to start training: ${e?.message || "Unknown error"}`);
    }
  }, []);
  
  const stopTraining = useCallback(() => {
    try {
      if (bleManager && typeof bleManager.stopTrainingSession === "function") {
        bleManager.stopTrainingSession();
      }
      setIsTraining(false);
      
      if (bleManager && typeof bleManager.sendComfortSignal === "function") {
        bleManager.sendComfortSignal("human", { vibration: "pulse" });
      }
      
      
      Alert.alert("Training", "Training stopped.");
    } catch (e: any) {
      console.warn("Stop training error:", e);
      setIsTraining(false); // Ensure state is updated even on error
    }
  }, []);
  
  const sendComfort = useCallback(
    async (target: "dog" | "human", vibration: "gentle" | "pulse" = "gentle") => {
      try {
        // Safety: Check if methods exist
        if (!bleManager || typeof bleManager.isRoleConnected !== "function") {
          Alert.alert("Error", "Bluetooth manager not available");
          return;
        }

        if (!bleManager.isRoleConnected("vest")) {
          Alert.alert("Therapy Vest", "Connect the therapy vest before sending comfort signals.");
          return;
        }
        
        // Use new sendTherapyCommand API
        if (typeof bleManager.sendTherapyCommand === "function") {
          // Map comfort signals to therapy commands
          const commandCode = vibration === "gentle" ? THERAPY.MASSAGE : THERAPY.CALM;
          const success = await bleManager.sendTherapyCommand(commandCode);
          
          if (success) {
            Alert.alert(
              "Comfort",
              target === "dog" ? "Comfort signal sent to your dog." : "Comfort signal sent to you."
            );
          } else {
            Alert.alert("Error", "Failed to send comfort signal. Please try again.");
          }
        } else if (typeof bleManager.sendComfortSignal === "function") {
          // Fallback to legacy method
          await bleManager.sendComfortSignal(target, { vibration });
          Alert.alert(
            "Comfort",
            target === "dog" ? "Comfort signal sent to your dog." : "Comfort signal sent to you."
          );
        } else {
          Alert.alert("Error", "Comfort signal function not available");
        }
      } catch (e: any) {
        console.warn("Comfort signal failed", e);
        Alert.alert("Comfort", `Failed to send comfort signal: ${e?.message || "Unknown error"}`);
      }
    },
    []
  );

  // manual sync
  const manualSync = useCallback(() => {
    try {
      if (bleManager && typeof bleManager.manualFetch === "function") {
        bleManager.manualFetch();
        Alert.alert("Sync", "Requested latest telemetry (mock).");
      } else {
        Alert.alert("Error", "Sync function not available");
      }
    } catch (e: any) {
      console.warn("Sync error:", e);
      Alert.alert("Error", `Sync failed: ${e?.message || "Unknown error"}`);
    }
  }, []);

  // simple Pair action (opens Pairing screen)
  const onPair = useCallback(() => {
    try {
      if (navigation) {
        navigation.navigate("Pairing");
      } else {
        router.push("/pairing");
      }
    } catch (err: any) {
      console.error("Navigation error:", err);
      Alert.alert("Error", "Could not navigate to Pairing screen. Please try again.");
    }
  }, [navigation, router]);

  // Device meta helpers (defensive casts with safety checks)
  const assignedName = (() => {
    try {
      if (deviceState && deviceState.assignedProfile) {
        return deviceState.assignedProfile === "human"
          ? "You (assigned)"
          : "Dog (assigned)";
      }
    } catch (e) {
      console.warn("Error reading assignedProfile:", e);
    }
    return "No device assigned";
  })();
  
  const connected = (() => {
    try {
      return !!(deviceState && deviceState.isConnected);
    } catch (e) {
      return false;
    }
  })();
  
  const deviceBattery = (() => {
    try {
      if (connected && deviceState) {
        return deviceState.human?.battery ?? deviceState.dog?.battery ?? "--";
      }
    } catch (e) {
      console.warn("Error reading device battery:", e);
    }
    return "--";
  })();
  
  const deviceRssi = (() => {
    try {
      return (deviceState as any)?.rssi ?? (bleManager as any)?.rssi ?? "--";
    } catch (e) {
      return "--";
    }
  })();
  
  const sessions = (() => {
    try {
      return Array.isArray(deviceState?.sessions) ? deviceState.sessions : [];
    } catch (e) {
      return [];
    }
  })();

  /* ---------- Render ---------- */
  return (
    <SafeAreaView style={[styles.screen, { paddingTop: Math.max(insets.top, 10) }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoPlaceholder}>
            <MaterialCommunityIcons
              name="dog"
              size={28}
              color={activeTheme.primary}
            />
          </View>
          <View>
            <Text style={styles.appName}>Pawsome</Text>
            <Text style={styles.appSub}>Calm insights for better training</Text>
          </View>
        </View>

        {/* small header actions */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View collapsable={false}>
            <TouchableOpacity
              onPress={() => {
                if (navigation) {
                  navigation.navigate("BondAI");
                } else {
                  router.push("/bondai");
                }
              }}
              style={{ padding: 8 }}
              accessibilityLabel="Open BondAI"
            >
              <MaterialIcons name="chat" size={20} color={activeTheme.primary} />
            </TouchableOpacity>
          </View>

          <View collapsable={false}>
            <TouchableOpacity
              onPress={() => {
                if (navigation) {
                  navigation.navigate("Settings");
                } else {
                  router.push("/settings");
                }
              }}
              style={{ padding: 8 }}
              accessibilityLabel="Settings"
            >
              <MaterialIcons
                name="settings"
                size={20}
                color={activeTheme.primary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Content */}
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        {/* Content starts directly here - no banner */}

        {/* Bond Score Rings - 3 separate circles */}
        <View
          ref={ringsContainerRef}
          collapsable={false}
          style={{
            marginTop: 18,
            gap: 22,
            alignItems: "center",
            marginBottom: 20,
            minHeight: 300, // Ensure consistent measurement
          }}
          onLayout={() => {
            // Trigger re-measurement when layout changes
          }}
        >
          {ThreeRingDisplay}
        </View>

        {/* Device Strip — TAP to open details */}
        <TouchableOpacity
          onPress={() => setDeviceModalOpen(true)}
          activeOpacity={0.95}
        >
          <LinearGradient
            colors={[activeTheme.card, activeTheme.cardElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.deviceStrip}
          >
            <View style={styles.deviceLeft}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 12,
                  backgroundColor: connected ? activeTheme.green : activeTheme.alert,
                }}
              />
              <View>
                <Text style={styles.deviceName}>
                  {connected
                    ? (deviceState?.assignedProfile ? assignedName : "Connected")
                    : "No device connected"}
                </Text>
                <Text style={styles.deviceMeta}>
                  {connected
                    ? `Battery ${deviceBattery}% • RSSI ${deviceRssi}`
                    : "Tap Pair to connect a device"}
                </Text>
              </View>
            </View>

            {/* Simplified primary action area */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {!connected ? (
                <AnimatedButton
                  onPress={onPair}
                  style={{
                    backgroundColor: activeTheme.primary,
                    padding: 10,
                    borderRadius: activeTheme.buttonRadius,
                    shadowColor: activeTheme.primary,
                    shadowOpacity: 0.45,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="bluetooth"
                      size={16}
                      color={activeTheme.textOnPrimary}
                    />
                    <Text style={{ color: activeTheme.textOnPrimary, fontWeight: "700" }}>
                      Pair
                    </Text>
                  </View>
                </AnimatedButton>
              ) : (
                <>
                  <AnimatedButton
                    onPress={manualSync}
                    style={{
                      backgroundColor: activeTheme.card,
                      padding: 10,
                      borderRadius: activeTheme.buttonRadius,
                      borderWidth: 1,
                      borderColor: activeTheme.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <MaterialIcons
                        name="sync"
                        size={16}
                        color={activeTheme.textDark}
                      />
                      <Text
                        style={{
                          color: activeTheme.textDark,
                          fontWeight: "700",
                        }}
                      >
                        Sync
                      </Text>
                    </View>
                  </AnimatedButton>

                  <AnimatedButton
                    onPress={() => {
                      if (isTraining) stopTraining();
                      else startTraining();
                    }}
                    style={{
                      backgroundColor: isTraining
                        ? activeTheme.orange
                        : activeTheme.primary,
                      padding: 10,
                      borderRadius: activeTheme.buttonRadius,
                      shadowColor: isTraining ? activeTheme.orange : activeTheme.primary,
                      shadowOpacity: 0.4,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <FontAwesome5 name="running" size={12} color={activeTheme.textOnPrimary} />
                      <Text style={{ color: activeTheme.textOnPrimary, fontWeight: "700" }}>
                        {isTraining ? "Stop" : "Start"}
                      </Text>
                    </View>
                  </AnimatedButton>
                </>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Onboarding carousel */}
        <LinearGradient
          colors={[activeTheme.card, activeTheme.cardElevated]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.onboardingWrap}
        >
          <Animated.ScrollView
            ref={carouselRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onCarouselScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ alignItems: "center" }}
          >
            {CAROUSEL_SLIDES.map((s, i) => (
              <View
                key={i}
                style={[styles.onboardingSlide, { width: screenW - 36 }]}
              >
                <View
                  style={{
                    width: 78,
                    height: 78,
                    borderRadius: 20,
                    backgroundColor: activeTheme.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                  }}
                >
                  {s.icon}
                </View>
                <Text style={styles.onboardingTitle}>{s.title}</Text>
                <Text style={styles.onboardingText}>{s.text}</Text>
                
                {/* Slide indicator */}
                <Text style={{ color: activeTheme.textMuted, fontSize: 12, marginTop: 8 }}>
                  {i + 1}/{CAROUSEL_SLIDES.length}
                </Text>

                <AnimatedButton
                  onPress={() => {
                    try {
                      if (i === 0) {
                        // Track & Train - Pair Now
                        if (navigation) {
                          navigation.navigate("Pairing");
                        } else {
                          router.push("/pairing");
                        }
                      } else if (i === 1) {
                        // Smart Device - Learn More
                        Alert.alert(
                          "Dual Devices",
                          "Learn more about connecting two devices"
                        );
                      } else {
                        // BondAI Chat - Navigate to BondAI
                        if (navigation) {
                          navigation.navigate("BondAI");
                        } else {
                          router.push("/bondai");
                        }
                      }
                    } catch (err) {
                      console.error("Navigation error:", err);
                      Alert.alert("Error", "Could not navigate. Please try again.");
                    }
                  }}
                  style={{ marginTop: 12 }}
                >
                  <View
                    collapsable={false}
                    style={{
                      backgroundColor: activeTheme.primary,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: activeTheme.buttonRadius,
                      shadowColor: activeTheme.primary,
                      shadowOpacity: 0.35,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                    }}
                  >
                    <Text style={{ color: activeTheme.textOnPrimary, fontWeight: "800" }}>
                      {i === 0
                        ? "Pair Now"
                        : i === 1
                          ? "Learn More"
                          : "Chat with BondAI"}
                    </Text>
                  </View>
                </AnimatedButton>
              </View>
            ))}
          </Animated.ScrollView>

          <View style={{ marginTop: 12, alignItems: "center" }}>
            <Dots
              count={CAROUSEL_SLIDES.length}
              index={
                carouselX.interpolate({
                  inputRange: CAROUSEL_SLIDES.map((_, i) => i * (screenW - 36)),
                  outputRange: CAROUSEL_SLIDES.map((_, i) => i),
                  extrapolate: "clamp",
                }) as any
              }
              theme={activeTheme}
            />
          </View>
        </LinearGradient>

        {/* Quick Training Session */}
        <View style={{ marginTop: 8 }}>
          <Text
            style={{
              fontWeight: "800",
              color: activeTheme.textDark,
              marginBottom: 10,
              fontSize: 18,
            }}
          >
            Training Session
          </Text>
          
          {/* Device Connection Status */}
          <View style={styles.deviceStatusRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: dogOnline ? activeTheme.primary : activeTheme.textMuted,
                }}
              />
              <Text
                style={{
                  color: dogOnline ? activeTheme.primary : activeTheme.textMuted,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                Collar {dogOnline ? "Connected" : "Not Connected"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: vestOnline ? activeTheme.primary : activeTheme.textMuted,
                }}
              />
              <Text
                style={{
                  color: vestOnline ? activeTheme.primary : activeTheme.textMuted,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                Vest {vestOnline ? "Connected" : "Not Connected"}
              </Text>
            </View>
          </View>

          {/* Start/Stop Session Button */}
          <TouchableOpacity
            onPress={() => (isTraining ? stopTraining() : startTraining())}
            disabled={!dogOnline || !vestOnline}
            style={[
              {
                backgroundColor: isTraining
                  ? activeTheme.orange
                  : activeTheme.primary,
                paddingVertical: 14,
                paddingHorizontal: 20,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 12,
                opacity: dogOnline && vestOnline ? 1 : 0.5,
                shadowColor: isTraining ? activeTheme.orange : activeTheme.primary,
                shadowOpacity: 0.3,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              },
            ]}
          >
            <Text style={{ color: activeTheme.textOnPrimary, fontWeight: "800", fontSize: 16 }}>
              {isTraining ? "⏹ Stop Session" : "▶ Start Session"}
            </Text>
            {!dogOnline || !vestOnline ? (
              <Text style={{ color: activeTheme.textOnPrimary, fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                Connect devices to start
              </Text>
            ) : null}
          </TouchableOpacity>

          {/* Comfort Signals */}
          {isTraining && (
            <View style={{ marginTop: 16 }}>
              <Text
                style={{
                  color: activeTheme.textMuted,
                  fontSize: 13,
                  fontWeight: "600",
                  marginBottom: 10,
                }}
              >
                Comfort Signals
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => sendComfort("dog", "gentle")}
                  disabled={!vestOnline}
                  style={[
                    {
                      flex: 1,
                      backgroundColor: activeTheme.card,
                      borderWidth: 1,
                      borderColor: activeTheme.border,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      alignItems: "center",
                      opacity: vestOnline ? 1 : 0.5,
                    },
                  ]}
                >
                  <Text style={{ color: activeTheme.textDark, fontWeight: "600", fontSize: 14 }}>
                    🐕 Comfort Dog
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => sendComfort("human", "pulse")}
                  disabled={!vestOnline}
                  style={[
                    {
                      flex: 1,
                      backgroundColor: activeTheme.card,
                      borderWidth: 1,
                      borderColor: activeTheme.border,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      alignItems: "center",
                      opacity: vestOnline ? 1 : 0.5,
                    },
                  ]}
                >
                  <Text style={{ color: activeTheme.textDark, fontWeight: "600", fontSize: 14 }}>
                    👤 Comfort Human
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: activeTheme.textMuted, marginTop: 8, fontSize: 11 }}>
                Sends red light and gentle vibration to the vest for 30 seconds
              </Text>
            </View>
          )}
        </View>

        {/* Analytics Section */}
        <View style={{ marginTop: 24 }}>
          <TouchableOpacity
            onPress={() => {
              try {
                if (navigation) {
                  navigation.navigate("Analytics");
                } else {
                  router.push("/analytics");
                }
              } catch (err: any) {
                console.error("Navigation error:", err);
              }
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: activeTheme.glassBackground || activeTheme.card,
              borderWidth: 1,
              borderColor: activeTheme.border,
              paddingVertical: 14,
              paddingHorizontal: 18,
              borderRadius: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <MaterialIcons
                name="analytics"
                size={24}
                color={activeTheme.primary}
              />
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: activeTheme.textDark,
                }}
              >
                Analytics & Progress
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={activeTheme.textMuted}
            />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Version:{" "}
            {Constants.expoConfig?.version ??
              "1.0.0"}
          </Text>
          <Text style={[styles.footerText, { marginTop: 6 }]}>
            Support: support@Pawsome.example • Privacy • Terms
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>

      {/* Device Details modal */}
      <DeviceDetailsModal
        visible={deviceModalOpen}
        onClose={() => setDeviceModalOpen(false)}
        state={deviceState}
        theme={activeTheme}
      />

      {/* Onboarding Tutorial */}
      <OnboardingTutorial
        steps={TUTORIAL_STEPS}
        visible={showOnboarding}
        onComplete={completeOnboarding}
      />
    </SafeAreaView>
  );
}
