// src/api/chat.ts
// Connects BondAI frontend to your backend. Reads API base from Expo extras first,
// then falls back to your localtunnel URL. Replace the fallback if the tunnel URL changes.

import Constants from "expo-constants";

const BASE =
  // prefer app.json / app.config extra (recommended)
  (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.API_BASE) ||
  // fallback to your current localtunnel URL (replace if it changes)
  "https://doggpt-demo.loca.lt";

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
