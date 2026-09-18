// Server-only: deliver purchased credentials to a Telegram chat reliably.
//
// Sending one Telegram message per credential breaks large orders: a 42-item
// order needs 42 outbound calls in a single serverless invocation, which hits
// the platform's subrequest/time budget and silently stops halfway (the user
// then only receives ~25 of 42 items).
//
// This helper batches several credentials into one message (staying well below
// Telegram's 4096-character limit), retries a failed batch item-by-item and, as
// a last resort, uploads the whole order as a .txt file so nothing is ever lost.

import { sendMessage, sendDocumentUpload } from "@/lib/telegram.server";

const MAX_CHARS = 3400;
const MAX_ITEMS_PER_MESSAGE = 6;

function esc(t: string) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Batch = { from: number; to: number; items: string[] };

function batchItems(items: string[]): Batch[] {
  const out: Batch[] = [];
  let cur: string[] = [];
  let len = 0;
  let start = 0;
  items.forEach((raw, i) => {
    const piece = esc(String(raw));
    const cost = piece.length + 40;
    if (cur.length && (cur.length >= MAX_ITEMS_PER_MESSAGE || len + cost > MAX_CHARS)) {
      out.push({ from: start + 1, to: i, items: cur });
      cur = [];
      len = 0;
      start = i;
    }
    cur.push(piece);
    len += cost;
  });
  if (cur.length) out.push({ from: start + 1, to: items.length, items: cur });
  return out;
}

export type DeliverItemsResult = { sent: number; failed: number; fallbackFile: boolean };

/**
 * Send every credential of an order to the buyer.
 * `items` are raw (unescaped) credential blocks.
 */
export async function deliverItemsToChat(
  chatId: number | string,
  productName: string,
  items: string[],
  opts: { orderNo?: number | string | null; orderId?: string | null; fileText?: string | null } = {},
): Promise<DeliverItemsResult> {
  const list = items.filter((i) => String(i ?? "").trim().length > 0);
  if (!list.length) return { sent: 0, failed: 0, fallbackFile: false };

  const orderLine = opts.orderNo ? `\nOrder #${opts.orderNo}` : "";
  const batches = batchItems(list);
  let sent = 0;
  const missed: number[] = [];

  for (const b of batches) {
    const range = b.from === b.to ? `${b.from} of ${list.length}` : `${b.from}–${b.to} of ${list.length}`;
    const body =
      `📦 <b>${esc(productName)} — ${range}</b>${orderLine}\n` +
      b.items.map((it, i) => `<b>#${b.from + i}</b>\n<pre>${it}</pre>`).join("\n");
    const res = await sendMessage(chatId, body);
    if (res?.ok) {
      sent += b.items.length;
      continue;
    }
    // Batch rejected (too long / bad entity) — retry the items one by one.
    for (let i = 0; i < b.items.length; i++) {
      const single = await sendMessage(
        chatId,
        `📦 <b>${esc(productName)} — ${b.from + i} of ${list.length}</b>${orderLine}\n<pre>${b.items[i]}</pre>`,
      );
      if (single?.ok) sent += 1;
      else missed.push(b.from + i);
    }
  }

  let fallbackFile = false;
  if (missed.length) {
    console.error(
      `Telegram delivery incomplete for order ${opts.orderNo ?? opts.orderId ?? "unknown"}: missing items ${missed.join(",")}`,
    );
    const text =
      opts.fileText ??
      list.map((it, i) => `--- Credential ${i + 1} of ${list.length} ---\n${it}\n`).join("\n");
    const name = `order-${opts.orderNo ?? "items"}-${list.length}.txt`;
    const doc = await sendDocumentUpload(
      chatId,
      name,
      text,
      `📎 <b>${esc(productName)}</b> — all ${list.length} item(s) in one file.`,
    );
    fallbackFile = Boolean(doc?.ok);
  }

  return { sent, failed: missed.length, fallbackFile };
}
