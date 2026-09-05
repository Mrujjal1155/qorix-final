// Server-only helpers for order history downloads (.txt files sent by the bot).
import { createHmac } from "crypto";
import { parseStock } from "@/lib/stock-format";

function secret() {
  return (
    process.env["TELEGRAM_WEBHOOK_SECRET"] ||
    process.env["SB_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    "qorix-order-file"
  );
}

/** Short human code shown in Telegram, e.g. ORD-7706FE87. */
export function orderCode(orderId: string) {
  return "ORD-" + String(orderId).replace(/-/g, "").slice(-8).toUpperCase();
}

/** Signed, unguessable token for the public download endpoint. */
export function signOrderToken(orderId: string, kind: "full" | "plain") {
  const sig = createHmac("sha256", secret()).update(`${orderId}:${kind}`).digest("hex").slice(0, 24);
  return `${orderId}.${kind}.${sig}`;
}

export function verifyOrderToken(token: string): { orderId: string; kind: "full" | "plain" } | null {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [orderId, kind, sig] = parts as [string, string, string];
  if (kind !== "full" && kind !== "plain") return null;
  if (signOrderToken(orderId, kind) !== token || !sig) return null;
  return { orderId, kind };
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
export function orderFileText(order: OrderLike, brand = "Qamify") {
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
