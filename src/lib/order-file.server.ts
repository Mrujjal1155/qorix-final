// Server-only helpers for order history downloads (.txt files sent by the bot).
import { createHmac, timingSafeEqual } from "crypto";
import { parseStock } from "@/lib/stock-format";

/** Dedicated signing secret only. Missing → null (fail closed, no fallback). */
function secret(): string | null {
  const s = process.env["ORDER_DOWNLOAD_SECRET"];
  return s && s.length >= 16 ? s : null;
}

import { orderCode } from "@/lib/order-code";
export { orderCode };

export const ORDER_TOKEN_TTL_SECONDS = 24 * 60 * 60;

function hmac(key: string, payload: string) {
  return createHmac("sha256", key).update(payload).digest("hex"); // full 64 hex
}

/** Signed, expiring token for the public download endpoint. Null when no secret configured. */
export function signOrderToken(
  orderId: string,
  kind: "full" | "plain",
  nowSec = Math.floor(Date.now() / 1000),
): string | null {
  const key = secret();
  if (!key) return null;
  const exp = nowSec + ORDER_TOKEN_TTL_SECONDS;
  return `${orderId}.${kind}.${exp}.${hmac(key, `${orderId}:${kind}:${exp}`)}`;
}

export function verifyOrderToken(
  token: string,
  nowSec = Math.floor(Date.now() / 1000),
): { orderId: string; kind: "full" | "plain" } | null {
  const key = secret();
  if (!key) return null;
  const parts = String(token).split(".");
  if (parts.length !== 4) return null;
  const [orderId, kind, expRaw, sig] = parts as [string, string, string, string];
  if (kind !== "full" && kind !== "plain") return null;
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const exp = Number(expRaw);
  if (exp <= nowSec || exp > nowSec + ORDER_TOKEN_TTL_SECONDS) return null;
  const expected = Buffer.from(hmac(key, `${orderId}:${kind}:${exp}`), "hex");
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { orderId, kind };
}

/** Only paid + delivered orders may be downloaded. */
export function isOrderDownloadable(order: { status?: string | null; delivered_content?: string | null } | null) {
  if (!order) return false;
  const st = String(order.status ?? "");
  return (st === "completed" || st === "delivered") && credentialItems(order.delivered_content).length > 0;
}

/** Split delivered content into individual credential items. */
export function credentialItems(content: string | null | undefined): string[] {
  const raw = String(content ?? "").trim();
  if (!raw) return [];
  try {
    const items = parseStock(raw, "auto");
    return items.length ? items : [raw];
  } catch {
    return [raw];
  }
}

type OrderLike = {
  id: string;
  order_no?: number | null;
  product_name?: string | null;
  quantity?: number | null;
  total?: number | null;
  status?: string | null;
  created_at?: string | null;
  delivered_content?: string | null;
};

/** Full, documented .txt export of one order. */
export function orderFileText(order: OrderLike, brand = "QORIX") {
  const items = credentialItems(order.delivered_content);
  const head =
    `${brand} — Order receipt\n` +
    `==============================\n` +
    `Order ID   : ${orderCode(order.id)}\n` +
    (order.order_no ? `Order No   : #${order.order_no}\n` : "") +
    `Product    : ${order.product_name ?? "-"}\n` +
    `Quantity   : ${order.quantity ?? 1}\n` +
    `Total      : $${Number(order.total ?? 0).toFixed(2)}\n` +
    `Status     : ${order.status ?? "-"}\n` +
    `Order time : ${order.created_at ? new Date(order.created_at).toUTCString() : "-"}\n` +
    `Items      : ${items.length}\n` +
    `==============================\n\n`;
  const body = items.map((it, i) => `--- Credential ${i + 1} of ${items.length} ---\n${it}\n`).join("\n");
  return head + (body || "No credentials attached to this order yet.\n");
}

/** Bare credentials only — easy to paste into other tools. */
export function orderPlainText(order: OrderLike) {
  const items = credentialItems(order.delivered_content);
  return items.length ? items.join("\n") + "\n" : "";
}

export function orderFileName(order: OrderLike, kind: "full" | "plain") {
  const safe = String(order.product_name ?? "order")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20) || "order";
  const n = credentialItems(order.delivered_content).length;
  return `${orderCode(order.id)}-${n}-${safe}${kind === "plain" ? "-plain" : ""}.txt`;
}
