const fetch = require('node-fetch');

const GEMINI_API_KEY = "AIzaSyDRjL2a842N0MAqXFJc8cjeoRRF684tkIY";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function testChat() {
    console.log("Testing Gemini API connection (2.5-flash)...");

    const messages = [{ role: "user", content: "Hello" }];
    const contents = messages.map((msg) => ({
        role: "user",
        parts: [{ text: msg.content }],
    }));

    try {
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contents
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP Error ${response.status}: ${text}`);
        }

        const data = await response.json();
        console.log("✅ API Success!");
        console.log("Reply:", data.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (error) {
        console.error("❌ API Failed:", error.message);
    }
}

testChat();
