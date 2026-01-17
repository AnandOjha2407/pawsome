// src/screens/BondAI.tsx
import { sendChat } from "../api/chat";
import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  Animated,
  Keyboard,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";
import OnboardingTutorial from "../components/OnboardingTutorial";
import { usePageOnboarding } from "../hooks/usePageOnboarding";
import { TutorialStep } from "../components/OnboardingTutorial";

type Msg = { id: string; from: "user" | "bot"; text: string; ts: number };

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    header: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.card,
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: theme.textDark },
    headerSub: { fontSize: 12, color: theme.textMuted, marginTop: 4 },

    listContent: { padding: 12 },

    msgRow: { marginVertical: 6, flexDirection: "row" },
    msgRowLeft: { justifyContent: "flex-start" },
    msgRowRight: { justifyContent: "flex-end" },

    msgBubble: { maxWidth: "82%", padding: 10, borderRadius: 12 },
    msgUser: { backgroundColor: theme.primary, borderTopRightRadius: 4 },
    msgBot: { backgroundColor: theme.card, borderTopLeftRadius: 4, borderWidth: 1, borderColor: theme.border },

    msgText: { fontSize: 14, lineHeight: 20 },
    msgTextUser: { color: theme.textOnPrimary, fontWeight: "600" },
    msgTextBot: { color: theme.textDark },

    msgTs: { marginTop: 6, fontSize: 10, color: theme.textMuted, textAlign: "right" },

    inputContainer: {
      backgroundColor: "transparent",
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "flex-end",
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.card,
    },
    textInput: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.softPrimary,
      borderRadius: 12,
      fontSize: 14,
      color: theme.textDark,
    },
    sendBtn: {
      marginLeft: 10,
      backgroundColor: theme.primary,
      padding: 10,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}

export default function BondAI() {
  const { theme: activeTheme } = useTheme();
  const styles = createStyles(activeTheme);
  const insets = useSafeAreaInsets();

  // Onboarding
  const { showOnboarding, completeOnboarding } = usePageOnboarding("bondai");

  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { id: "1", from: "bot", text: "Hi — I'm BondAI. How can I help you and your companion today?", ts: Date.now() - 60000 },
  ]);
  const messagesRef = useRef<Msg[]>(messages);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const listRef = useRef<FlatList<Msg> | null>(null);
  const sending = useRef(false);
  const [loading, setLoading] = useState(false);

  // BondAI tutorial steps
  const BONDAI_TUTORIAL_STEPS: TutorialStep[] = [
    {
      id: "bondai-intro",
      title: "Meet BondAI",
      description:
        "This is your AI assistant BondAI. You can ask anything related to you or your fluffy friend - training tips, health insights, behavior questions, or anything else about your bond!",
      screen: "bondai",
    },
  ];

  // keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(e.endCoordinates?.height ?? 300);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const addMessage = useCallback((m: Msg) => {
    setMessages((s) => {
      const next = [...s, m];
      return next;
    });
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // Get current device data for context
  const [deviceData, setDeviceData] = useState<any>(null);

  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    
    const onData = (data: any) => {
      if (!isMountedRef.current) return;
      try {
        // Safety: Validate data before setting
        if (data && typeof data === "object") {
          setDeviceData(data);
        }
      } catch (e) {
        console.warn("BondAI: Error processing device data", e);
      }
    };

    try {
      const { bleManager } = require("../ble/BLEManager");
      
      // Safety: Check if methods exist
      if (bleManager && typeof bleManager.on === "function") {
        bleManager.on("data", onData);
      }

      // Get initial state
      if (isMountedRef.current) {
        try {
          if (bleManager && typeof bleManager.getState === "function") {
            const state = bleManager.getState();
            if (state && typeof state === "object") {
              setDeviceData({
                human: state.human || null,
                dog: state.dog || null,
                sleepScore: typeof state.sleepScore === "number" ? state.sleepScore : 0,
                recoveryScore: typeof state.recoveryScore === "number" ? state.recoveryScore : 0,
                strainScore: typeof state.strainScore === "number" ? state.strainScore : 0,
              });
            }
          }
        } catch (stateError) {
          console.warn("BondAI: Error getting initial state", stateError);
        }
      }
    } catch (e) {
      console.warn("BondAI: Failed to subscribe to BLE data", e);
    }

    return () => {
      isMountedRef.current = false;
      try {
        const { bleManager } = require("../ble/BLEManager");
        if (bleManager && typeof bleManager.off === "function") {
          bleManager.off("data", onData);
        }
      } catch (e) {
        console.warn("BondAI: Error removing BLE listener", e);
      }
    };
  }, []);

  // Build system prompt tailored to BondAI/DogGPT with device context
  const buildSystemPrompt = () => {
    let prompt = `You are BondAI, an assistant for the BondPulse/DogGPT wearable app.
Be concise, friendly, and provide practical advice about training dogs, heart-rate telemetry, and guided relaxation for humans.

Current device data:`;

    if (deviceData) {
      if (deviceData.human) {
        prompt += `\nHuman (Polar H10): HR=${deviceData.human.heartRate || "N/A"}, HRV=${deviceData.human.hrv || "N/A"}, Battery=${deviceData.human.battery || "N/A"}%`;
      }
      if (deviceData.dog) {
        prompt += `\nDog (Polar H10): HR=${deviceData.dog.heartRate || "N/A"}, HRV=${deviceData.dog.hrv || "N/A"}, Battery=${deviceData.dog.battery || "N/A"}%`;
      }
      if (deviceData.sleepScore !== undefined) {
        prompt += `\nBond Score: ${deviceData.sleepScore}/100, Recovery: ${deviceData.recoveryScore || 0}/100, Strain: ${deviceData.strainScore || 0}/100`;
      }
    } else {
      prompt += `\nNo device data available yet.`;
    }

    prompt += `\n\nIf user asks about device data, use the current readings above. Provide actionable insights based on the metrics.`;

    return prompt;
  };

  const systemPrompt = buildSystemPrompt();

  const callBackend = useCallback(
    async (userText: string) => {
      try {
        // assemble a small history for context (system + last messages)
        const currentMessages = messagesRef.current || [];
        const history = [
          { role: "system", content: systemPrompt },
          // include last up to 8 messages to keep context short
          ...(Array.isArray(currentMessages) ? currentMessages.slice(-8) : []).map((m: Msg) => ({ 
            role: m.from === "user" ? "user" : "assistant", 
            content: m.text || "" 
          })),
          { role: "user", content: userText },
        ];

        return await sendChat(history);
      } catch (err) {
        console.error("callBackend error:", err);
        return { reply: "I encountered an error. Please try again." };
      }
    },
    [systemPrompt]
  );

  const onSend = useCallback(async () => {
    const text = value.trim();
    if (!text || sending.current) return;
    sending.current = true;
    setLoading(true);

    const userMsg: Msg = { id: String(Date.now()), from: "user", text, ts: Date.now() };
    addMessage(userMsg);
    setValue("");

    // thinking placeholder
    const thinkingId = `t-${Date.now()}`;
    const thinkingMsg: Msg = { id: thinkingId, from: "bot", text: "Thinking...", ts: Date.now() };
    addMessage(thinkingMsg);

    try {
      const json = await callBackend(text) as any; // expects { reply: string } from server
      const replyText = (json && (json.reply ?? json.result ?? json.text)) || "Sorry — no reply.";
      // remove thinking and add real reply
      setMessages((prev) => {
        try {
          const safePrev = Array.isArray(prev) ? prev : [];
          const filtered = safePrev.filter((m) => m && m.id !== thinkingId);
          return [...filtered, { id: `b-${Date.now()}`, from: "bot", text: String(replyText), ts: Date.now() }];
        } catch (err) {
          console.error("Error updating messages:", err);
          return prev; // Return previous state on error
        }
      });
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => {
        try {
          const safePrev = Array.isArray(prev) ? prev : [];
          const filtered = safePrev.filter((m) => m && m.id !== thinkingId);
          return [
            ...filtered,
            { id: `err-${Date.now()}`, from: "bot", text: "I couldn't reach the server. Try again later.", ts: Date.now() },
          ];
        } catch (updateErr) {
          console.error("Error updating error message:", updateErr);
          return prev; // Return previous state on error
        }
      });
    } finally {
      sending.current = false;
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    }
  }, [value, addMessage, callBackend]);

  const renderItem = ({ item }: { item: Msg }) => {
    const isUser = item.from === "user";
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowRight : styles.msgRowLeft]}>
        <Animated.View style={[styles.msgBubble, isUser ? styles.msgUser : styles.msgBot]}>
          <Text style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextBot]}>{item.text}</Text>
          <Text style={styles.msgTs}>{new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
        </Animated.View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { paddingTop: Math.max(insets.top, 10) }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BondAI</Text>
        <Text style={styles.headerSub}>AI companion — ask about training, heart-rate, or mood</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: 16 + keyboardHeight }]}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      />

      {/* Onboarding Tutorial */}
      <OnboardingTutorial
        steps={BONDAI_TUTORIAL_STEPS}
        visible={showOnboarding}
        onComplete={completeOnboarding}
      />

      {/* Input area pinned to bottom and moved above keyboardHeight */}
      <Animated.View style={[styles.inputContainer, { marginBottom: keyboardHeight }]}>
        <View style={styles.inputWrap}>
          <TextInput
            placeholder={loading ? "BondAI is thinking..." : "Ask BondAI..."}
            value={value}
            onChangeText={setValue}
            style={styles.textInput}
            multiline
            placeholderTextColor={activeTheme.textMuted}
            onFocus={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120)}
            accessibilityLabel="Message input"
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendBtn, loading && { opacity: 0.6 }]}
            onPress={onSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={loading}
          >
            <MaterialIcons name="send" size={20} color={activeTheme.textOnPrimary} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}
