// src/screens/BondPulse.tsx
import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Animated, Dimensions } from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";

const { width } = Dimensions.get("window");

export default function BondPulse() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // entrance animation (fade + translateY)
  const entrance = useRef(new Animated.Value(0)).current; // 0 -> hidden, 1 -> visible

  // heart pulse
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // entrance animation on mount
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start();

    // heart pulse loop
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();

    return () => loop.stop();
  }, [entrance, pulse]);

  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });
  const opacity = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={styles.container}>
      {/* subtle decorative circles */}
      <View style={styles.decorationTopRight} />
      <View style={styles.decorationBottomLeft} />

      <Animated.View style={[styles.card, { transform: [{ translateY }], opacity }]}>
        <Animated.View style={[styles.heartWrap, { transform: [{ scale: pulse }] }]}>
          <FontAwesome5 name="heart" size={72} color={theme.magenta} />
        </Animated.View>

        <Text style={styles.title}>BondPulse</Text>
        <Text style={styles.subtitle}>Coming Soon 💞</Text>
      </Animated.View>

      <Text style={styles.footer}>A cozy place for couples — launching soon.</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    card: {
      width: Math.min(width - 48, 420),
      backgroundColor: theme.card,
      borderRadius: 22,
      paddingVertical: 36,
      paddingHorizontal: 24,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.35,
      shadowRadius: 28,
      elevation: 8,
    },
    heartWrap: {
      width: 120,
      height: 120,
      borderRadius: 120,
      backgroundColor: theme.softPrimary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 18,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.textDark,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.textMuted,
    },
    footer: {
      marginTop: 28,
      color: theme.textMuted,
      fontSize: 13,
      opacity: 0.9,
    },
    decorationTopRight: {
      position: "absolute",
      right: -40,
      top: -20,
      width: 140,
      height: 140,
      borderRadius: 140,
      backgroundColor: theme.softPrimary,
      transform: [{ rotate: "12deg" }],
    },
    decorationBottomLeft: {
      position: "absolute",
      left: -60,
      bottom: -40,
      width: 220,
      height: 220,
      borderRadius: 220,
      backgroundColor: theme.overlayLight,
    },
  });
}
