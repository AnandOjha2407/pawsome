// src/api/chat.ts
// DIRECT GEMINI INTEGRATION (Serverless)
// This allows the app to work anywhere without a local backend server.

const GEMINI_API_KEY = "AIzaSyDRjL2a842N0MAqXFJc8cjeoRRF684tkIY";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export async function sendChat(messages: { role: string; content: string }[]) {
  try {
    console.log("→ Sending chat to Gemini (Direct)...");

    // Safety check: ensure messages is an array
    if (!Array.isArray(messages) || messages.length === 0) {
      return { reply: "No messages to send." };
    }

    // Convert messages to Gemini format
    const contents = messages
      .filter((msg) => msg && msg.role && msg.content) // Filter out invalid messages
      .map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: String(msg.content || "") }],
      }));

    // Safety check: ensure we have valid contents
    if (contents.length === 0) {
      return { reply: "No valid messages to send." };
    }

    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          topP: 0.8,
          topK: 40,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => null);
      throw new Error(`Gemini API error (${res.status}): ${text}`);
    }

    const data = await res.json();
    console.log("✅ Gemini reply:", data);

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.output ||
      "No reply from AI";

    return { reply };
  } catch (err) {
    console.error("❌ sendChat error:", err);
    // Fallback only if the internet is down completely
    return {
      reply: `I'm having trouble connecting (Error: ${err instanceof Error ? err.message : String(err)
        }). Please check your connection.`,
    };
  }
}
