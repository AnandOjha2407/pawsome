// src/api/chat.ts
const BASE = 'http://10.66.117.212:3000'; // <- include http://
export async function sendChat(messages: { role: string; content: string }[]) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => null);
    throw new Error('Chat API error: ' + (text || res.status));
  }
  return res.json(); // { reply: '...' }
}
