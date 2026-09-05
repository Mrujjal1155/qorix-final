/**
 * QORIX reseller starter — Telegram bot (zero dependency, long polling).
 *
 * চালাতে:  .env এ BOT_TOKEN + QORIX_KEY বসান  →  npm run bot
 * কমান্ড:  /start, /products, /balance
 */
import { randomUUID } from "node:crypto";

const API = process.env.QORIX_API || "https://qorixlab.com/api/public/reseller/v1";
const KEY = process.env.QORIX_KEY || "";
const TOKEN = process.env.BOT_TOKEN || "";
const MARKUP = Number(process.env.MARKUP || 1.25);

if (!KEY || !TOKEN) {
  console.error(".env এ QORIX_KEY এবং BOT_TOKEN দুটোই লাগবে।");
  process.exit(1);
}

const TG = `https://api.telegram.org/bot${TOKEN}`;

async function qorix(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error || `API error ${res.status}`);
  return body;
}

const tg = (method, payload) =>
  fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());

const sell = (p) => (Number(p) * MARKUP).toFixed(2);

async function sendProducts(chatId) {
  const { products } = await qorix("/products?channel=bot");
  if (!products.length) return tg("sendMessage", { chat_id: chatId, text: "এখন কোনো প্রোডাক্ট নেই।" });
  await tg("sendMessage", {
    chat_id: chatId,
    text: "আমাদের প্রোডাক্ট:",
    reply_markup: {
      inline_keyboard: products.slice(0, 20).map((p) => [{ text: `${p.name} — $${sell(p.price)}`, callback_data: `buy:${p.id}` }]),
    },
  });
}

async function buy(chatId, productId) {
  try {
    const out = await qorix("/orders", {
      method: "POST",
      body: JSON.stringify({ product_id: productId, quantity: 1, external_ref: randomUUID(), channel: "bot" }),
    });
    const items = (out.order.items || []).join("\n");
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `✅ Order #${out.order.order_no} — ${out.order.product_name}\n` +
        (items ? `\n${items}` : "\nম্যানুয়াল ডেলিভারি — শীঘ্রই পাঠানো হবে।"),
    });
  } catch (err) {
    await tg("sendMessage", { chat_id: chatId, text: `❌ ${err.message}` });
  }
}

let offset = 0;
console.log("Bot polling…");
for (;;) {
  try {
    const r = await fetch(`${TG}/getUpdates?timeout=30&offset=${offset}`).then((x) => x.json());
    for (const u of r.result || []) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (msg?.text === "/start") await tg("sendMessage", { chat_id: msg.chat.id, text: "স্বাগতম! /products লিখে প্রোডাক্ট দেখুন।" });
      else if (msg?.text === "/products") await sendProducts(msg.chat.id);
      else if (msg?.text === "/balance") {
        const me = await qorix("/me");
        await tg("sendMessage", { chat_id: msg.chat.id, text: `Reseller balance: $${me.reseller.balance}` });
      }
      if (u.callback_query) {
        const [action, id] = String(u.callback_query.data).split(":");
        await tg("answerCallbackQuery", { callback_query_id: u.callback_query.id });
        if (action === "buy") await buy(u.callback_query.message.chat.id, id);
      }
    }
  } catch (err) {
    console.error("poll error:", err.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
