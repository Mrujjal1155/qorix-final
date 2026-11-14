// Pure builder for public "LIVE update" channel posts. No I/O here so tests,
// admin preview and the sender share one format.
import { escapeHtml } from "@/lib/bot/richtext";

export type LiveKind = "purchase" | "topup" | "member";
export type LivePayload = {
  uid?: string;
  name?: string;
  product?: string;
  qty?: number;
  method?: string;
  source?: string;
};

export const LIVE_EMOJI_SLOTS: { slot: string; glyph: string; label: string }[] = [
  { slot: "title", glyph: "🎉", label: "Title" },
  { slot: "id", glyph: "📌", label: "ID" },
  { slot: "customer", glyph: "👤", label: "Customer" },
  { slot: "product", glyph: "🛒", label: "Product" },
  { slot: "qty", glyph: "⭐", label: "Quantity" },
  { slot: "time", glyph: "🕒", label: "Time" },
  { slot: "paid", glyph: "💳", label: "Paid" },
  { slot: "ok", glyph: "✅", label: "Success" },
  { slot: "member", glyph: "👋", label: "New member" },
  { slot: "member_title", glyph: "🎊", label: "Member: title" },
  { slot: "member_heart", glyph: "💖", label: "Member: welcome line" },
  { slot: "member_spark", glyph: "✨", label: "Member: sparkle" },
  { slot: "member_join", glyph: "🤖", label: "Member: joined via" },
  { slot: "topup_title", glyph: "💰", label: "Top-up: title" },
  { slot: "topup_status", glyph: "🟢", label: "Top-up: status" },
  { slot: "topup_shield", glyph: "🛡️", label: "Top-up: secure line" },
  { slot: "buy_title", glyph: "🛍️", label: "Purchase: title" },
  { slot: "buy_thanks", glyph: "🙏", label: "Purchase: thank-you line" },
  { slot: "buy_rocket", glyph: "🚀", label: "Purchase: delivered" },
];

/** 2808123968 → 2808***968; short ids keep only the edges. */
export function maskId(value: string | undefined | null): string {
  const s = String(value ?? "").replace(/-/g, "");
  if (!s) return "****";
  if (s.length <= 6) return s.slice(0, 1) + "***";
  return `${s.slice(0, 4)}***${s.slice(-3)}`;
}

/** Ahmed → A**** */
export function maskName(value: string | undefined | null): string {
  const first = Array.from(String(value ?? "").trim())[0];
  return `${first ? first.toUpperCase() : "U"}****`;
}

export function paymentLabel(method: string | undefined | null): string {
  const m = String(method ?? "").toLowerCase();
  if (!m || m === "balance" || m === "wallet") return "Wallet";
  if (m.includes("reseller")) return "Reseller Balance";
  if (m.includes("binance")) return "Binance Pay";
  if (m.includes("oxapay") || m.includes("usdt") || m.includes("crypto")) return "Crypto Pay";
  if (m.includes("eps")) return "EPS";
  if (m.includes("bkash") || m.includes("paykori")) return "bKash";
  return "Online Pay";
}

export function formatLiveTime(d: Date): string {
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const h24 = d.getUTCHours();
  const h = h24 % 12 || 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}-${mon}-${d.getUTCFullYear()} ${pad(h)}:${pad(d.getUTCMinutes())} ${h24 < 12 ? "AM" : "PM"} UTC`;
}

export function buildLivePost(
  kind: LiveKind,
  p: LivePayload,
  when: Date,
  emojiIds: Record<string, string> = {},
): string {
  const e = (slot: string) => {
    const glyph = LIVE_EMOJI_SLOTS.find((s) => s.slot === slot)?.glyph ?? "🔹";
    const id = String(emojiIds[slot] ?? "").trim();
    return /^\d{5,25}$/.test(id) ? `<tg-emoji emoji-id="${id}">${glyph}</tg-emoji>` : glyph;
  };
  // Native Telegram rich table (same style as stock notices); the sender
  // falls back to "Label: value" lines if Telegram rejects the table format.
  // Each kind has its own heading, table and closing lines so the three cards look distinct.
  const table = (rows: Array<[string, string]>) =>
    `<table bordered striped compact>${rows.map(([l, v]) => `<tr><td>${l}</td><td align="right">${v}</td></tr>`).join("")}</table>`;
  const name = maskName(p.name);
  if (kind === "member") {
    const via = p.source === "website" ? "Website" : "Bot";
    return `<h3>${e("member_title")} Welcome to the Family!</h3>` +
      `<p>${e("member")} A warm welcome, <b>${name}</b>! ${e("member_heart")}</p>` +
      table([
        [`${e("id")} Member ID`, maskId(p.uid)],
        [`${e("member_join")} Joined via`, `<b>${via}</b>`],
        [`${e("time")} Joined`, formatLiveTime(when)],
      ]) +
      `<p>${e("member_spark")} <i>We're glad to have you — explore, shop and enjoy!</i></p>`;
  }
  if (kind === "topup") {
    return `<h3>${e("topup_title")} Balance Top-up Confirmed</h3>` +
      table([
        [`${e("id")} Account`, maskId(p.uid)],
        [`${e("customer")} Customer`, name],
        [`${e("paid")} Method`, paymentLabel(p.method)],
        [`${e("topup_status")} Status`, `<b>Credited</b>`],
        [`${e("time")} Time`, formatLiveTime(when)],
      ]) +
      `<p>${e("ok")} Wallet credited successfully</p>` +
      `<p>${e("topup_shield")} <i>Secure &amp; verified payment</i></p>`;
  }
  return `<h3>${e("buy_title")} Thank You for Your Purchase!</h3>` +
    `<p>${e("buy_thanks")} <b>${name}</b>, thanks for shopping with us!</p>` +
    table([
      [`${e("id")} ID`, maskId(p.uid)],
      [`${e("product")} Product`, `<b>${escapeHtml(String(p.product ?? ""))}</b>`],
      [`${e("qty")} Quantity`, `<b>${Math.max(1, Number(p.qty ?? 1))}</b>`],
      [`${e("paid")} Paid`, paymentLabel(p.method)],
      [`${e("time")} Time`, formatLiveTime(when)],
    ]) +
    `<p>${e("buy_rocket")} Successfully delivered ${e("ok")}</p>`;
}

/** Minimal inline button shape shared with the Telegram keyboard type. */
export type LiveButton = { text: string; url: string; style?: "primary" | "success" | "danger" | "default"; icon_custom_emoji_id?: string };

/**
 * Purchase posts get one tappable Buy Now button that opens the bot;
 * top-up and member posts stay plain. No username → no button.
 */
export function livePostKeyboard(
  kind: LiveKind,
  botUsername: string | undefined | null,
  productEmojiId?: string | null,
): LiveButton[][] | undefined {
  const bot = String(botUsername ?? "").replace(/^@/, "").trim();
  if (kind !== "purchase" || !bot) return undefined;
  const icon = String(productEmojiId ?? "").trim();
  return [[{
    text: "Buy Now",
    url: `https://t.me/${bot}`,
    style: "primary",
    ...(/^\d{5,25}$/.test(icon) ? { icon_custom_emoji_id: icon } : {}),
  }]];
}
