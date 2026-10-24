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
  const lines: string[] = [];
  const title = kind === "purchase" ? "New Purchase!" : kind === "topup" ? "Wallet Top-up!" : "New Member Joined!";
  lines.push(`${kind === "member" ? e("member") : e("title")} <b>${title}</b>`, "");
  lines.push(`${e("id")} ID: ${maskId(p.uid)}`);
  lines.push(`${e("customer")} Customer: ${maskName(p.name)}`);
  if (kind === "purchase") {
    lines.push(`${e("product")} Product: <b>${escapeHtml(String(p.product ?? ""))}</b>`);
    lines.push(`${e("qty")} Quantity: <b>${Math.max(1, Number(p.qty ?? 1))}</b>`);
  }
  lines.push(`${e("time")} Time: ${formatLiveTime(when)}`);
  if (kind !== "member") lines.push(`${e("paid")} Paid: ${paymentLabel(p.method)}`);
  lines.push(
    `${e("ok")} ${kind === "purchase" ? "Successfully delivered" : kind === "topup" ? "Wallet credited" : `Welcome via ${p.source === "website" ? "Website" : "Bot"}`}`,
  );
  return lines.join("\n");
}

/** Minimal inline button shape shared with the Telegram keyboard type. */
export type LiveButton = { text: string; url: string };

/**
 * Purchase posts get one tappable Buy Now button that opens the bot;
 * top-up and member posts stay plain. No username → no button.
 */
export function livePostKeyboard(
  kind: LiveKind,
  botUsername: string | undefined | null,
): LiveButton[][] | undefined {
  const bot = String(botUsername ?? "").replace(/^@/, "").trim();
  if (kind !== "purchase" || !bot) return undefined;
  return [[{ text: "🛒 Buy Now", url: `https://t.me/${bot}` }]];
}
