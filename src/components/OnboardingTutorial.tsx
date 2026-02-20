// src/components/OnboardingTutorial.tsx
// Interactive tutorial with spotlight effect and blur overlay

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Pressable,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
// Removed expo-blur import - using custom overlay instead
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";
import { tutorialMeasurementRegistry } from "../utils/tutorialMeasurement";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type TutorialStep = {
  id: string;
  title: string;
  description: string;
  target?: {
    // Coordinates or ref-based positioning
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  // If target is a component, use a callback to measure
  measureTarget?: () => Promise<{ x: number; y: number; width: number; height: number }>;
  screen?: "home" | "dashboard" | "pairing" | "settings";
};

type Props = {
  steps: TutorialStep[];
  onComplete: () => void;
  visible: boolean;
};

export default function OnboardingTutorial({ steps, onComplete, visible }: Props) {
  const { theme } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlight, setSpotlight] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spotlightScale = useRef(new Animated.Value(0.8)).current;

  const currentStepData = steps[currentStep];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(spotlightScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      spotlightScale.setValue(0.8);
    }
  }, [visible]);

  useEffect(() => {
    const measureTarget = async () => {
      if (!currentStepData) {
        setSpotlight(null);
        return;
      }

      // Try to measure using registry first
      const measured = await tutorialMeasurementRegistry.measure(currentStepData.id);
      if (measured) {
        setSpotlight({
          x: measured.x,
          y: measured.y,
          width: measured.width,
          height: measured.height,
        });
        return;
      }

      // Fallback to step's measureTarget callback
      if (currentStepData.measureTarget) {
        const rect = await currentStepData.measureTarget();
        setSpotlight({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
        return;
      }

      // Fallback to static target coordinates
      if (currentStepData.target) {
        setSpotlight({
          x: currentStepData.target.x || 0,
          y: currentStepData.target.y || 0,
          width: currentStepData.target.width || 200,
          height: currentStepData.target.height || 100,
        });
        return;
      }

      // No target - full screen
      setSpotlight(null);
    };

    measureTarget();
  }, [currentStep, currentStepData]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // After last step, show simple guides
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onComplete();
      setCurrentStep(0);
    });
  };

  if (!visible) return null;

  // Calculate spotlight position and dimensions
  const padding = 12; // Padding around highlighted element
  const spotlightX = spotlight?.x ?? SCREEN_WIDTH / 2 - 100;
  const spotlightY = spotlight?.y ?? SCREEN_HEIGHT / 2 - 100;
  const spotlightW = spotlight?.width ?? 200;
  const spotlightH = spotlight?.height ?? 100;

  // Calculate overlay sections to create cutout effect
  const topHeight = Math.max(0, spotlightY - padding);
  const bottomTop = spotlightY + spotlightH + padding;
  const bottomHeight = Math.max(0, SCREEN_HEIGHT - bottomTop);
  const leftWidth = Math.max(0, spotlightX - padding);
  const rightLeft = spotlightX + spotlightW + padding;
  const rightWidth = Math.max(0, SCREEN_WIDTH - rightLeft);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Animated.View
        style={[
          styles.container,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        {/* Overlay with cutout effect - using 4 sections to create a "hole" */}
        {spotlight ? (
          <>
            {/* Top overlay */}
            {topHeight > 0 && (
              <View
                style={[
                  styles.overlaySection,
                  {
                    top: 0,
                    left: 0,
                    right: 0,
                    height: topHeight,
                    backgroundColor: theme.background + "E6", // 90% opacity
                  },
                ]}
              />
            )}

            {/* Middle section with left, cutout, right */}
            <View
              style={{
                position: "absolute",
                top: topHeight,
                left: 0,
                right: 0,
                height: spotlightH + padding * 2,
                flexDirection: "row",
              }}
            >
              {/* Left overlay */}
              {leftWidth > 0 && (
                <View
                  style={[
                    styles.overlaySection,
                    {
                      width: leftWidth,
                      height: spotlightH + padding * 2,
                      backgroundColor: theme.background + "E6",
                    },
                  ]}
                />
              )}

              {/* Spotlight highlight area (transparent with border) */}
              <Animated.View
                style={[
                  styles.spotlight,
                  {
                    width: spotlightW + padding * 2,
                    height: spotlightH + padding * 2,
                    transform: [{ scale: spotlightScale }],
                    borderColor: theme.primary,
                    shadowColor: theme.primary,
                    backgroundColor: "transparent",
                  },
                ]}
              >
                <View style={[styles.spotlightInner, { borderColor: theme.primary }]} />
              </Animated.View>

              {/* Right overlay */}
              {rightWidth > 0 && (
                <View
                  style={[
                    styles.overlaySection,
                    {
                      width: rightWidth,
                      height: spotlightH + padding * 2,
                      backgroundColor: theme.background + "E6",
                    },
                  ]}
                />
              )}
            </View>

            {/* Bottom overlay */}
            {bottomHeight > 0 && (
              <View
                style={[
                  styles.overlaySection,
                  {
                    top: bottomTop,
                    left: 0,
                    right: 0,
                    height: bottomHeight,
                    backgroundColor: theme.background + "E6",
                  },
                ]}
              />
            )}
          </>
        ) : (
          /* Full overlay when no spotlight */
          <View
            style={[
              styles.fullOverlay,
              {
                backgroundColor: theme.background + "E6",
              },
            ]}
          />
        )}

        {/* Content Card - positioned intelligently */}
        <Animated.View
          style={[
            styles.contentCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              shadowColor: theme.primary,
            },
            spotlight
              ? {
                  // Position below spotlight if there's room, otherwise above
                  top:
                    bottomTop + 20 < SCREEN_HEIGHT - 250
                      ? bottomTop + 20
                      : Math.max(20, spotlightY - 280),
                }
              : {
                  // Center when no spotlight
                  top: SCREEN_HEIGHT / 2 - 150,
                },
          ]}
        >
          <View style={styles.contentHeader}>
            <Text
              style={[
                styles.stepIndicator,
                { color: theme.primary },
              ]}
            >
              {currentStep + 1} / {steps.length}
            </Text>
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={[styles.skipText, { color: theme.textMuted }]}>Skip</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: theme.textDark }]}>
            {currentStepData?.title}
          </Text>
          <Text style={[styles.description, { color: theme.textMuted }]}>
            {currentStepData?.description}
          </Text>



          <View style={styles.buttonRow}>
            {currentStep > 0 && (
              <TouchableOpacity
                onPress={() => setCurrentStep(currentStep - 1)}
                style={[styles.buttonSecondary, { borderColor: theme.border }]}
              >
                <Text style={[styles.buttonSecondaryText, { color: theme.textDark }]}>
                  Back
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleNext}
              style={[
                styles.buttonPrimary,
                { backgroundColor: theme.primary },
                currentStep === 0 && styles.buttonFullWidth,
              ]}
            >
              <Text style={[styles.buttonPrimaryText, { color: theme.textOnPrimary }]}>
                {currentStep < steps.length - 1 ? "Next" : "Get Started"}
              </Text>
              <MaterialIcons
                name={currentStep < steps.length - 1 ? "arrow-forward" : "check"}
                size={20}
                color={theme.textOnPrimary}
                style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  overlaySection: {
    position: "absolute",
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlight: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  spotlightInner: {
    flex: 1,
    borderRadius: 13,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  contentCard: {
    position: "absolute",
    left: 20,
    right: 20,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: SCREEN_HEIGHT * 0.4,
  },
  contentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  stepIndicator: {
    fontSize: 14,
    fontWeight: "600",
  },
  skipButton: {
    padding: 4,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "500",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  buttonPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonFullWidth: {
    flex: 1,
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: "600",
  },
  buttonSecondary: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: "600",
  },
  guidesContainer: {
    marginTop: 16,
    gap: 12,
  },
  guideItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  guideText: {
    fontSize: 15,
    fontWeight: "500",
  },
});

