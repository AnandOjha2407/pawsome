// src/screens/Home.tsx
import { useTheme } from "../ThemeProvider";
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
  Image,
  TouchableOpacity,
  Platform,
  Modal,
  SafeAreaView,
  AccessibilityInfo,
  Easing,
  Switch,
  FlatList,
} from "react-native";
import {
  MaterialIcons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import { bleManager } from "../ble/BLEManager";
import Constants from "expo-constants";
import Svg, { Circle, G } from "react-native-svg";
import { Animated as RNAnimated } from "react-native";
const AnimatedG = RNAnimated.createAnimatedComponent(G);

type Props = { navigation: any; route?: any };
const screenW = Dimensions.get("window").width;

/* ---------- Static assets (ensure these exist) ---------- */
const bannerDog = require("../../assets/images/banner.jpg");
const avatarDog = require("../../assets/images/avatar_placeholder.png");

const momentsDog = [
  require("../../assets/images/moments_1.jpg"),
  require("../../assets/images/moments_2.jpg"),
  require("../../assets/images/moments_3.jpg"),
];

/* ---------- Theme (Dog mode only) ---------- */
const dogTheme = {
  background: "#f6fbfb",
  card: "#ffffff",
  primary: "#2aa6a0",
  softPrimary: "#e6f6f7",
  textDark: "#123235",
  textMuted: "#5f7b79",
  green: "#2aa876",
  orange: "#e07b39",
  purple: "#7c5cff",
  gradient: ["#e6f6f7", "#f6fbfb"],
};

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
function Dots({ count, index }: { count: number; index: Animated.Value }) {
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
              backgroundColor: "#fff",
              transform: [{ scale: dotScale }],
              opacity,
              marginHorizontal: 4,
              borderWidth: 0.5,
              borderColor: "rgba(0,0,0,0.06)",
            }}
          />
        );
      })}
    </View>
  );
}

/* ---------- Styles factory ---------- */
function createStyles(theme: typeof dogTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingTop: Platform.OS === "ios" ? 48 : 20,
      paddingHorizontal: 18,
      paddingBottom: 10,
      backgroundColor: theme.card,
      borderBottomColor: "#e6edf3",
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
      borderRadius: 12,
      backgroundColor: theme.softPrimary,
      alignItems: "center",
      justifyContent: "center",
    },
    appName: { fontSize: 20, fontWeight: "700", color: theme.textDark },
    appSub: { fontSize: 12, color: theme.textMuted },

    content: { padding: 18, paddingBottom: 48 },
    parallaxBannerWrap: {
      width: screenW - 36,
      height: 170,
      borderRadius: 14,
      overflow: "hidden",
      alignSelf: "center",
      marginBottom: 14,
    },
    parallaxBanner: { width: "100%", height: "100%", resizeMode: "cover" },

    heroSection: {
      borderRadius: 16,
      paddingVertical: 22,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
      backgroundColor: theme.card,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    },
    heroRow: { flexDirection: "row", alignItems: "center", gap: 16 },
    heroImage: {
      width: 110,
      height: 110,
      borderRadius: 16,
      marginBottom: 8,
      backgroundColor: "#eee",
    },
    heroTitle: {
      fontSize: 24,
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
    getStartedBtn: { marginTop: 14, borderRadius: 12, overflow: "hidden" },
    getStartedInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: theme.primary,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    getStartedText: { color: "#fff", fontWeight: "800" },
    heroNote: {
      marginTop: 10,
      color: theme.textMuted,
      fontSize: 12,
      textAlign: "center",
    },

    deviceStrip: {
      marginTop: 12,
      marginBottom: 10,
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    deviceLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    deviceName: { fontWeight: "700", color: theme.textDark },
    deviceMeta: { color: theme.textMuted, fontSize: 12 },

    onboardingWrap: {
      marginTop: 14,
      height: 220,
      borderRadius: 12,
      overflow: "hidden",
    },
    onboardingSlide: {
      width: screenW - 36,
      padding: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    onboardingTitle: {
      fontSize: 18,
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
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
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
    },
    trainingBtn: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 120,
    },

    momentsWrap: { marginTop: 16 },
    momentCard: {
      width: 140,
      height: 100,
      borderRadius: 10,
      overflow: "hidden",
      marginRight: 12,
      backgroundColor: "#eee",
    },
    momentImage: { width: "100%", height: "100%" },

    footer: {
      marginTop: 24,
      paddingVertical: 18,
      borderTopWidth: 1,
      borderTopColor: "#eef3f4",
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
}: {
  visible: boolean;
  onClose: () => void;
  state: any;
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

  const sendCueLocal = (type: "vibrate" | "beep" | "tone") => {
    bleManager.sendCue?.(type);
    Alert.alert("Sent", `Cue: ${type}`);
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
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            maxHeight: "82%",
            backgroundColor: "#fff",
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            padding: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "800", fontSize: 16 }}>
              Device Details
            </Text>
            <Pressable onPress={onClose}>
              <MaterialIcons name="close" size={20} />
            </Pressable>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: "700" }}>
              {state.assignedProfile
                ? `${state.assignedProfile}`
                : "Unassigned"}
            </Text>
            <Text style={{ color: "#64748b", marginTop: 4 }}>
              {state.isConnected ? "Connected" : "Not connected"}
            </Text>
            <Text style={{ color: "#64748b", marginTop: 6 }}>
              Battery: {state.human?.battery ?? state.dog?.battery ?? "--"}%
            </Text>
            <Text style={{ color: "#64748b", marginTop: 2 }}>
              RSSI: {(state as any).rssi ?? (bleManager as any).rssi ?? "--"}
            </Text>
            <Text style={{ color: "#64748b", marginTop: 2 }}>
              FW: {state?.firmwareVersion ?? "--"}
            </Text>
          </View>

          <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => bleManager.manualFetch?.()}
              style={{
                backgroundColor: "#f3f4f6",
                padding: 10,
                borderRadius: 8,
              }}
            >
              <Text>Force Sync</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => bleManager.connect?.()}
              style={{
                backgroundColor: "#f3f4f6",
                padding: 10,
                borderRadius: 8,
              }}
            >
              <Text>Connect</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => bleManager.disconnect?.()}
              style={{
                backgroundColor: "#f3f4f6",
                padding: 10,
                borderRadius: 8,
              }}
            >
              <Text>Disconnect</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>Cues</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => sendCueLocal("vibrate")}
                style={{
                  padding: 10,
                  backgroundColor: "#eef2ff",
                  borderRadius: 8,
                }}
              >
                <Text>Vibrate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => sendCueLocal("beep")}
                style={{
                  padding: 10,
                  backgroundColor: "#eef2ff",
                  borderRadius: 8,
                }}
              >
                <Text>Beep</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => sendCueLocal("tone")}
                style={{
                  padding: 10,
                  backgroundColor: "#eef2ff",
                  borderRadius: 8,
                }}
              >
                <Text>Tone</Text>
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
            <Text style={{ fontWeight: "700" }}>Developer mock mode</Text>
            <Switch value={mockOn} onValueChange={toggleMock} />
          </View>

          <View style={{ marginTop: 12, flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              onPress={copyLogs}
              style={{
                backgroundColor: "#f3f4f6",
                padding: 10,
                borderRadius: 8,
              }}
            >
              <Text>Show Logs</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => assignTo("human")}
              style={{
                backgroundColor: "#f3f4f6",
                padding: 10,
                borderRadius: 8,
              }}
            >
              <Text>Assign → Me</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => assignTo("dog")}
              style={{
                backgroundColor: "#f3f4f6",
                padding: 10,
                borderRadius: 8,
              }}
            >
              <Text>Assign → Dog</Text>
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
  theme: typeof dogTheme;
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
    </Animated.View>
  );
}

/* ---------- Main Home component (simplified connect UX) ---------- */
export default function Home({ navigation }: Props) {
  // ---------- THREE RING DISPLAY WITH TRIANGULAR LAYOUT + CENTER ENLARGE ----------

  const [ringScores, setRingScores] = useState({
    sleep: 0, // Bond
    recovery: 0, // Dog Health
    strain: 0, // Human Health
  });

  const [selected, setSelected] = useState<number | null>(null);

  // BLE listener
  useEffect(() => {
    const fn = (data: any) => {
      if (!data) return;
      setRingScores({
        sleep: data.sleepScore ?? 0,
        recovery: data.recoveryScore ?? 0,
        strain: data.strainScore ?? 0,
      });
    };
    bleManager.on("data", fn);
    return () => bleManager.off("data", fn);
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
            <Text style={{ color: "white", fontSize: 20, fontWeight: "900" }}>
              {value}%
            </Text>
            <Text style={{ color: "white", fontSize: 12, opacity: 0.9 }}>
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
              backgroundColor: "rgba(255,255,255,0.15)",
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
            }}
          >
            <Text style={{ color: "white", fontSize: 11, lineHeight: 18 }}>
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
      <Ring i={0} label="Bond Score" value={ringScores.sleep} color="#6C63FF" />
      <Ring
        i={1}
        label="Dog Health"
        value={ringScores.recovery}
        color="#10B981"
      />
      <Ring
        i={2}
        label="Human Health"
        value={ringScores.strain}
        color="#FB7185"
      />
    </View>
  );
  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  const { theme: activeTheme } = useTheme(); // ← cleaned version
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
      text: "Real-time telemetry for your dog. Heart rate, activity, and AI-driven training suggestions.",
      icon: <MaterialCommunityIcons name="pulse" size={42} color="#fff" />,
    },
    {
      title: "Smart Device",
      text: "Connect with your dog and track it's health",
      icon: (
        <MaterialCommunityIcons name="link-variant" size={42} color="#fff" />
      ),
    },
    {
      title: "BondAI Chat",
      text: "Ask BondAI for training tips, health insights and quick exercises — contextual to your device data.",
      icon: <MaterialIcons name="chat" size={42} color="#fff" />,
    },
  ];

  // Moments scroll
  const momentScrollX = useRef(new Animated.Value(0)).current;

  // deviceState (derived from bleManager)
  const [deviceState, setDeviceState] = useState<any>(
    bleManager.getState?.() ?? { isConnected: false }
  );
  useEffect(() => {
    const update = () =>
      setDeviceState(bleManager.getState?.() ?? { isConnected: false });
    const onData = () => update();
    const onAssigned = () => update();
    const onLogs = () => update();
    bleManager.on("data", onData);
    bleManager.on("assigned", onAssigned);
    bleManager.on("logs", onLogs);
    update();
    return () => {
      bleManager.off("data", onData);
      bleManager.off("assigned", onAssigned);
      bleManager.off("logs", onLogs);
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
      bleManager.startTrainingSession?.();
      setIsTraining(true);
      Alert.alert("Training", "Training started.");
    } catch (e) {
      console.warn(e);
    }
  }, []);
  const stopTraining = useCallback(() => {
    try {
      bleManager.stopTrainingSession?.();
      setIsTraining(false);
      Alert.alert("Training", "Training stopped.");
    } catch (e) {
      console.warn(e);
    }
  }, []);
  const sendCue = useCallback(
    (type: "vibrate" | "beep" | "tone" = "vibrate") => {
      try {
        bleManager.sendCue?.(type);
        Alert.alert("Cue", `Sent ${type}`);
      } catch (e) {
        console.warn(e);
      }
    },
    []
  );

  // manual sync
  const manualSync = useCallback(() => {
    try {
      bleManager.manualFetch?.();
      Alert.alert("Sync", "Requested latest telemetry (mock).");
    } catch (e) {
      console.warn(e);
    }
  }, []);

  // simple Pair action (opens Pairing screen)
  const onPair = useCallback(() => {
    navigation.navigate("Pairing");
  }, [navigation]);

  // Device meta helpers (defensive casts)
  const assignedName = deviceState.assignedProfile
    ? deviceState.assignedProfile === "human"
      ? "You (assigned)"
      : "Dog (assigned)"
    : "No device assigned";
  const connected = !!deviceState.isConnected;
  const deviceBattery = connected
    ? deviceState.human?.battery ?? deviceState.dog?.battery ?? "--"
    : "--";
  const deviceRssi =
    (deviceState as any).rssi ?? (bleManager as any).rssi ?? "--";
  const sessions = (deviceState.sessions ?? []) as any[];

  /* ---------- Render ---------- */
  return (
    <SafeAreaView style={styles.screen}>
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
          <TouchableOpacity
            onPress={() => navigation.navigate("BondAI")}
            style={{ padding: 8 }}
            accessibilityLabel="Open BondAI"
          >
            <MaterialIcons name="chat" size={20} color={activeTheme.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate("Settings")}
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
        {/* Parallax banner */}
        <View style={styles.parallaxBannerWrap}>
          <Animated.Image
            source={bannerDog}
            style={[
              styles.parallaxBanner,
              {
                transform: [
                  {
                    translateY: scrollY.interpolate({
                      inputRange: [-200, 0, 200],
                      outputRange: [-20, 0, 40],
                      extrapolate: "clamp",
                    }),
                  },
                  {
                    scale: scrollY.interpolate({
                      inputRange: [-200, 0],
                      outputRange: [1.08, 1],
                      extrapolate: "clamp",
                    }),
                  },
                ],
              },
            ]}
          />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 48,
              backgroundColor: "rgba(0,0,0,0.06)",
            }}
          />
        </View>

        {/* Device Strip — TAP to open details */}
        <TouchableOpacity
          onPress={() => setDeviceModalOpen(true)}
          activeOpacity={0.95}
        >
          <View style={styles.deviceStrip}>
            <View style={styles.deviceLeft}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 12,
                  backgroundColor: connected ? "#2ecc71" : "#ff7a6b",
                }}
              />
              <View>
                <Text style={styles.deviceName}>
                  {connected
                    ? deviceState.assignedProfile
                      ? assignedName
                      : "Connected"
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
                    borderRadius: 10,
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
                      color="#fff"
                    />
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
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
                      borderRadius: 10,
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
                      borderRadius: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <FontAwesome5 name="running" size={12} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "700" }}>
                        {isTraining ? "Stop" : "Start"}
                      </Text>
                    </View>
                  </AnimatedButton>
                </>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* Onboarding carousel */}
        <View style={styles.onboardingWrap}>
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

                <AnimatedButton
                  onPress={() => {
                    if (i === 0) navigation.navigate("Pairing");
                    else if (i === 1)
                      Alert.alert(
                        "Dual Devices",
                        "Learn more about connecting two devices"
                      );
                    else navigation.navigate("BondAI");
                  }}
                  style={{ marginTop: 12 }}
                >
                  <View
                    style={{
                      backgroundColor: activeTheme.primary,
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800" }}>
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
            />
          </View>
        </View>

        {/* Bond Score Rings - 3 separate circles */}
        <View
          style={{
            marginTop: 18,
            gap: 22,
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          {ThreeRingDisplay}
        </View>

        {/* Quick Training / Wellness CTA */}
        <View style={{ marginTop: 8 }}>
          <Text
            style={{
              fontWeight: "800",
              color: activeTheme.textDark,
              marginBottom: 10,
            }}
          >
            Quick Training
          </Text>
          <View style={styles.trainingRow}>
            <TouchableOpacity
              onPress={() => (isTraining ? stopTraining() : startTraining())}
              style={[
                styles.trainingBtn,
                {
                  backgroundColor: isTraining
                    ? activeTheme.orange
                    : activeTheme.primary,
                },
              ]}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {isTraining ? "Stop Session" : "Start Session"}
              </Text>
            </TouchableOpacity>

            {/* Keep cue buttons secondary and hidden behind device details — simple placeholder */}
            <TouchableOpacity
              onPress={() => sendCue("vibrate")}
              style={[
                styles.trainingBtn,
                {
                  backgroundColor: activeTheme.card,
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.06)",
                },
              ]}
            >
              <Text style={{ color: activeTheme.textDark }}>Quick Cue</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: activeTheme.textMuted, marginBottom: 8 }}>
              Recent Sessions
            </Text>
            {(sessions || []).slice(0, 3).map((s: any, idx: number) => (
              <View
                key={s.id ?? idx}
                style={{
                  backgroundColor: activeTheme.card,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{ fontWeight: "800", color: activeTheme.textDark }}
                  >
                    {s.notes ?? "Session"}
                  </Text>
                  <Text style={{ color: activeTheme.textMuted, fontSize: 12 }}>
                    {s.durationMin ? `${s.durationMin}m` : "—"}
                  </Text>
                </View>
                <Text
                  style={{
                    color: activeTheme.textMuted,
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  {new Date(s.date ?? Date.now()).toLocaleString()}
                </Text>
              </View>
            ))}

            {!sessions || sessions.length === 0 ? (
              <Text style={{ color: activeTheme.textMuted }}>
                No sessions yet — start one to see recommendations.
              </Text>
            ) : null}
          </View>
        </View>

        {/* Moments */}
        <View style={styles.momentsWrap}>
          <Text
            style={{
              fontWeight: "800",
              color: activeTheme.textDark,
              marginBottom: 8,
            }}
          >
            Moments
          </Text>
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: momentScrollX } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingVertical: 8 }}
          >
            {momentsDog.map((img: any, i: number) => {
              const inputRange = [(i - 1) * 156, i * 156, (i + 1) * 156];
              const scale = momentScrollX.interpolate({
                inputRange,
                outputRange: [0.9, 1.05, 0.9],
                extrapolate: "clamp",
              });
              const translateY = momentScrollX.interpolate({
                inputRange,
                outputRange: [6, 0, 6],
                extrapolate: "clamp",
              });
              return (
                <TouchableOpacity key={i} activeOpacity={0.9}>
                  <Animated.View
                    style={[
                      styles.momentCard,
                      { transform: [{ scale }, { translateY }] },
                    ]}
                  >
                    <Image source={img} style={styles.momentImage} />
                  </Animated.View>
                </TouchableOpacity>
              );
            })}
          </Animated.ScrollView>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Version:{" "}
            {Constants.manifest?.version ??
              Constants.manifest?.expo?.version ??
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
      />
    </SafeAreaView>
  );
}
