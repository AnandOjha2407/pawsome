// src/screens/Home.tsx
import React, { useState } from "react";
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
} from "react-native";
import {
  MaterialIcons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";

type Props = { navigation: any; route?: any };
const screenW = Dimensions.get("window").width;

/* Preload images (static requires) */
const bannerDog = require("../../assets/images/banner.jpg");
const bannerBond = require("../../assets/images/banner_bp.png"); // add this image
const avatarDog = require("../../assets/images/avatar_placeholder.png");
const avatarBond = require("../../assets/images/avatar_bp.png"); // add this image

const momentsDog = [
  require("../../assets/images/moments_1.jpg"),
  require("../../assets/images/moments_2.jpg"),
  require("../../assets/images/moments_3.jpg"),
];

const momentsBond = [
  require("../../assets/images/bond_moments_1.png"), // add these images
  require("../../assets/images/bond_moments_2.png"),
  require("../../assets/images/bond_moments_3.png"),
];

/* AnimatedButton */
function AnimatedButton({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      friction: 6,
    }).start();

  const handlePressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      android_ripple={{ color: "rgba(0,0,0,0.04)" }}
      style={({ pressed }) => [{ opacity: pressed ? 0.98 : 1 }]}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default function Home({ navigation }: Props) {
  const [isDogMode, setIsDogMode] = useState(true);

  /* Action definitions */
  const dogActions = [
    {
      key: "dashboard",
      icon: <MaterialIcons name="dashboard" size={24} color={theme.primary} />,
      label: "Dashboard",
      onPress: () => navigation.navigate("Dashboard"),
    },
    {
      key: "training",
      icon: <FontAwesome5 name="running" size={24} color={theme.green} />,
      label: "Training",
      onPress: () => Alert.alert("Training", "Open Training (stub)"),
    },
    {
      key: "bondai",
      icon: <MaterialIcons name="chat" size={24} color={theme.orange} />,
      label: "BondAI",
      onPress: () => navigation.navigate("BondAI"),
    },
    {
      key: "history",
      icon: <MaterialIcons name="history" size={24} color={theme.purple} />,
      label: "History",
      onPress: () => navigation.navigate("History"),
    },
  ];

  const bondActions = [
    {
      key: "wellness",
      icon: (
        <MaterialCommunityIcons
          name="heart-pulse"
          size={24}
          color={theme.orange}
        />
      ),
      label: "Wellness",
      onPress: () => navigation.navigate("Wellness"),
    },
    {
      key: "meditation",
      icon: (
        <MaterialCommunityIcons
          name="meditation"
          size={24}
          color={theme.primary}
        />
      ),
      label: "Meditation",
      onPress: () => Alert.alert("Meditation", "Open guided meditation (stub)"),
    },
    {
      key: "mood",
      icon: <MaterialIcons name="mood" size={24} color={theme.green} />,
      label: "Mood Check",
      onPress: () => navigation.navigate("MoodCheck"),
    },
    {
      key: "insights",
      icon: <MaterialIcons name="insights" size={24} color={theme.purple} />,
      label: "Insights",
      onPress: () => navigation.navigate("Insights"),
    },
  ];

  const actionsToRender = isDogMode ? dogActions : bondActions;
  const bannerSource = isDogMode ? bannerDog : bannerBond;
  const heroAvatar = isDogMode ? avatarDog : avatarBond;
  const momentsSource = isDogMode ? momentsDog : momentsBond;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoPlaceholder}>
            <MaterialCommunityIcons
              name={isDogMode ? "dog" : "hand-heart"}
              size={28}
              color={theme.primary}
            />
          </View>
          <View>
            <Text style={styles.appName}>
              {isDogMode ? "DogGPT" : "BondPulse"}
            </Text>
            <Text style={styles.appSub}>
              {isDogMode
                ? "Calm insights for better training"
                : "Understand your emotions better"}
            </Text>
          </View>
        </View>
      </View>

      {/* Toggle */}
      <View style={styles.toggleBar}>
        <Pressable
          onPress={() => setIsDogMode(true)}
          style={[styles.toggleBtn, isDogMode && styles.activeToggle]}
        >
          <Text style={isDogMode ? styles.activeText : styles.inactiveText}>
            DogGPT
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setIsDogMode(false)}
          style={[styles.toggleBtn, !isDogMode && styles.activeToggle]}
        >
          <Text style={!isDogMode ? styles.activeText : styles.inactiveText}>
            BondPulse
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner */}
        <Image source={bannerSource} style={styles.banner} resizeMode="cover" />

        {/* HERO */}
        <View style={styles.heroSection}>
          <Image
            source={heroAvatar}
            style={styles.heroImage}
            resizeMode="contain"
          />
          <Text style={styles.heroTitle}>
            {isDogMode ? "Connect with your dog" : "Connect with yourself"}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isDogMode
              ? "Track activity, monitor heart rate, and get AI-powered training tips to strengthen your bond."
              : "Monitor stress, discover emotional patterns, and get guided exercises personalized for you."}
          </Text>

          <AnimatedButton
            onPress={() => navigation.navigate("Pairing")}
            style={styles.getStartedBtn}
          >
            <View style={styles.getStartedInner}>
              <MaterialCommunityIcons name="bluetooth" size={18} color="#fff" />
              <Text style={styles.getStartedText}>Get Started</Text>
            </View>
          </AnimatedButton>

          <Text style={styles.heroNote}>
            {isDogMode
              ? "Pair the DogGPT harness to begin live tracking and training sessions."
              : "Pair BondPulse to start real-time mood and heart-rate monitoring."}
          </Text>
        </View>

        {/* Device Card */}
        <View style={[styles.deviceCard, { marginTop: 6 }]}>
          <View>
            <Text style={styles.deviceLabel}>Connected Device</Text>
            <Text style={styles.deviceName}>
              {isDogMode ? "No device paired" : "No wristband connected"}
            </Text>
            <Text style={styles.deviceSmall}>
              {isDogMode
                ? "Tap Pair to connect your DogGPT harness"
                : "Tap Pair to connect your BondPulse wearable"}
            </Text>
          </View>

          <AnimatedButton
            onPress={() => navigation.navigate("Pairing")}
            style={[styles.pairBtn, styles.pairBtnShadow]}
          >
            <View style={styles.pairInner}>
              <MaterialCommunityIcons name="bluetooth" size={20} color="#fff" />
              <Text style={styles.pairBtnText}>Pair</Text>
            </View>
          </AnimatedButton>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          {actionsToRender.map((a) => (
            <ActionTile
              key={a.key}
              icon={a.icon}
              label={a.label}
              onPress={a.onPress}
            />
          ))}
        </View>

        {/* Insights */}
        <View style={styles.insightsCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.insightsTitle}>
              {isDogMode ? "Insights" : "Daily Insights"}
            </Text>
            <Text style={styles.insightsText}>
              {isDogMode
                ? "AI recommendations appear after training sessions to help you reinforce positive behavior."
                : "Personalized wellness summaries and mood trends to help you improve wellbeing."}
            </Text>
          </View>
          <AnimatedButton
            onPress={() => navigation.navigate("Insights")}
            style={styles.insightBtnWrap}
          >
            <View
              style={[
                styles.insightBtn,
                !isDogMode && { backgroundColor: theme.orange },
              ]}
            >
              <MaterialIcons name="insights" size={20} color="#fff" />
            </View>
          </AnimatedButton>
        </View>

        {/* Moments */}
        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Moments</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 8 }}
        >
          {momentsSource.map((img: any, i: number) => (
            <TouchableOpacity key={i} style={styles.momentCard}>
              <Image source={img} style={styles.momentImage} />
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

/* ActionTile */
function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <AnimatedButton onPress={onPress} style={styles.actionTile}>
      <View style={styles.actionIconWrap}>{icon}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </AnimatedButton>
  );
}

/* Theme + styles */
const theme = {
  background: "#f6fbfb",
  card: "#ffffff",
  primary: "#2c9aa6",
  softPrimary: "#e6f6f7",
  textDark: "#0f1722",
  textMuted: "#64748b",
  green: "#2aa876",
  orange: "#e07b39",
  purple: "#7c5cff",
};

const styles = StyleSheet.create({
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
    justifyContent: "flex-start",
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

  toggleBar: {
    flexDirection: "row",
    backgroundColor: "#e9f4f4",
    marginHorizontal: 18,
    marginTop: 10,
    borderRadius: 10,
    overflow: "hidden",
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activeToggle: { backgroundColor: theme.primary },
  activeText: { color: "#fff", fontWeight: "700" },
  inactiveText: { color: theme.textDark, fontWeight: "600" },

  content: { padding: 18 },
  banner: {
    width: screenW - 36,
    height: 140,
    borderRadius: 12,
    marginBottom: 14,
    alignSelf: "center",
  },

  heroSection: {
    backgroundColor: theme.card,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  heroImage: {
    width: 110,
    height: 110,
    borderRadius: 20,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.textDark,
    marginBottom: 8,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  getStartedBtn: { marginTop: 16, borderRadius: 12, overflow: "hidden" },
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

  deviceCard: {
    backgroundColor: theme.card,
    padding: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  deviceLabel: { color: "#94a3b8", fontSize: 12 },
  deviceName: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 6,
    color: theme.textDark,
  },
  deviceSmall: { fontSize: 12, color: theme.textMuted, marginTop: 4 },

  pairBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pairInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  pairBtnText: { color: "#fff", marginLeft: 6, fontWeight: "700" },
  pairBtnShadow: {
    shadowColor: theme.primary,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },

  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontWeight: "700",
    color: theme.textDark,
  },

  actionsRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 12,
    marginBottom: 14,
  },

  actionTile: {
    width: (screenW - 18 * 2 - 12 * 3) / 4 - 2,
    backgroundColor: theme.card,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  actionIconWrap: {
    backgroundColor: "#f1f7f7",
    padding: 12,
    borderRadius: 999,
    marginBottom: 8,
  },
  actionLabel: { fontSize: 12, color: theme.textDark, fontWeight: "600" },

  insightsCard: {
    marginTop: 10,
    backgroundColor: theme.card,
    padding: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  insightsTitle: { fontWeight: "700", fontSize: 16, color: theme.textDark },
  insightsText: { color: theme.textMuted, marginTop: 6, fontSize: 13 },
  insightBtnWrap: { borderRadius: 12 },
  insightBtn: {
    backgroundColor: theme.green,
    padding: 10,
    borderRadius: 10,
    alignSelf: "center",
  },

  momentCard: {
    width: 140,
    height: 100,
    borderRadius: 10,
    overflow: "hidden",
    marginRight: 12,
    backgroundColor: "#eee",
  },
  momentImage: { width: "100%", height: "100%" },
});

