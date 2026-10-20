import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tg } from "@/lib/telegram.server";
import { loadAllBotUserIds, sendPaced } from "@/lib/bot/audience.server";
import {
  PRODUCT_LIST_EMOJI_KEYS,
  buildProductListMarkdown,
  formatUsd,
  parseEmoji,
  productListSettingKey,
  type ListProduct,
} from "@/lib/product-list";

async function loadSettings() {
  const { data } = await (supabaseAdmin as any).from("bot_settings").select("key,value");
  const s: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) s[r.key] = r.value ?? "";
  return s;
}

export async function buildProductList() {
  const db = supabaseAdmin as any;
  const [s, prods] = await Promise.all([
    loadSettings(),
    db
      .from("products")
      .select("name,price,emoji,telegram_custom_emoji_id,featured_rank,sort_order")
      .eq("is_active", true)
      .is("owner_reseller_id", null)
      .order("sort_order", { ascending: true })
      .limit(1000),
  ]);
  const products: ListProduct[] = ((prods.data ?? []) as any[]).map((p) => ({
    name: p.name,
    price: Number(p.price ?? 0),
    emoji: p.emoji,
    custom_emoji_id: p.telegram_custom_emoji_id,
  }));
  const emojis: Record<string, string> = {};
  for (const k of PRODUCT_LIST_EMOJI_KEYS) emojis[k.key] = s[productListSettingKey(k.key)] ?? "";
  const botUsername = s["bot_username"] ?? "";
  const storeName = s["store_name"] || s["shop_name"] || "QORIX";
  const markdown = buildProductListMarkdown({ storeName, botUsername, products, emojis });
  const groups = [
    ...new Set(
      Object.entries(s)
        .filter(([k]) => k === "announce_chat_id" || k === "announce_chat_inhouse" || k.startsWith("announce_chat_supplier:"))
        .map(([, v]) => String(v ?? "").trim())
        .filter(Boolean),
    ),
  ];
  return { markdown, products, botUsername, storeName, emojis, groups };
}

function fallbackHtml(list: Awaited<ReturnType<typeof buildProductList>>) {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = list.products.map((p) => {
    const e = parseEmoji(p.custom_emoji_id ? `${p.custom_emoji_id}|${p.emoji || "📦"}` : p.emoji, "📦");
    const icon = e.customId ? `<tg-emoji emoji-id="${e.customId}">${e.glyph}</tg-emoji>` : e.glyph;
    return `${icon} ${esc(p.name)} — <b>${formatUsd(p.price)}</b>`;
  });
  return `<b>${esc(list.storeName)} — PRICE LIST</b>\n\n${lines.join("\n")}`;
}

async function sendTo(chatId: number | string, list: Awaited<ReturnType<typeof buildProductList>>, kb: any) {
  const rich = await tg("sendRichMessage", { chat_id: chatId, rich_message: { markdown: list.markdown }, ...(kb ? { reply_markup: kb } : {}) });
  if (rich.ok) return { ok: true };
  // Older clients/API: still deliver a readable list.
  const html = fallbackHtml(list);
  const res = await tg("sendMessage", { chat_id: chatId, text: html.slice(0, 4000), parse_mode: "HTML", ...(kb ? { reply_markup: kb } : {}) });
  return { ok: res.ok, error: rich.description ?? res.description };
}

export async function sendProductList() {
  const list = await buildProductList();
  if (!list.products.length) throw new Error("No active products to list");
  const kb = list.botUsername
    ? { inline_keyboard: [[{ text: "🛒 Open the shop", url: `https://t.me/${list.botUsername.replace(/^@/, "")}`, style: "success" }]] }
    : null;

  let groupsSent = 0;
  let lastError = "";
  for (const g of list.groups) {
    const r = await sendTo(g, list, kb);
    if (r.ok) groupsSent++;
    else lastError = r.error ?? lastError;
  }

  const users = await loadAllBotUserIds();
  const r = await sendPaced(users, (id) => sendTo(id, list, kb));
  const sent = r.sent, failed = r.failed;
  if (r.error) lastError = r.error;
  return { sent, failed, total: users.length, groupsSent, groupsTotal: list.groups.length, error: lastError };
}
