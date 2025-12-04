// src/api/chat.ts
// Connects BondAI frontend to your backend. Reads API base from Expo extras first,
// then falls back to local network IP for development.

import Constants from "expo-constants";
import { Platform } from "react-native";

// Get local IP for development (Android emulator uses 10.0.2.2, iOS simulator uses localhost)
const getLocalBase = () => {
  if (Platform.OS === "android") {
    // For Android emulator, use 10.0.2.2 to access host machine
    // For physical device, use your computer's local IP (e.g., 192.168.1.4)
    return "http://192.168.1.4:3000";
  } else {
    // iOS simulator can use localhost
    return "http://localhost:3000";
  }
};

// Get base URL - prioritize local IP for development, ignore old tunnel URLs
const getBaseUrl = () => {
  const configUrl = Constants.expoConfig?.extra?.API_BASE;
  
  // If config has old tunnel URL or invalid URL, use local IP
  if (configUrl && configUrl.includes("loca.lt")) {
    console.log("⚠️ Ignoring old tunnel URL, using local IP");
    return getLocalBase();
  }
  
  // Use config URL if it's valid, otherwise fallback to local IP
  return configUrl || getLocalBase();
};

const BASE = getBaseUrl();

export async function sendChat(messages: { role: string; content: string }[]) {
  try {
    const url = `${BASE}/api/chat`;
    console.log("→ Sending chat to:", url);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => null);
      throw new Error("Chat API error: " + (text || res.status));
    }

    const json = await res.json();
    console.log("✅ Chat reply:", json);
    return json; // { reply: "..." }
  } catch (err) {
    console.error("❌ sendChat error:", err);
    throw err;
  }
}
