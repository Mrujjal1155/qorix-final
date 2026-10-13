// Server-only OxaPay settlement for website orders and Telegram wallet deposits.
// Every call re-reads the invoice from OxaPay; the webhook body is never trusted.
// order_id we send: "W-<orders.id>" for website orders, "D-<binance_deposits.id>" for bot deposits.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { oxapayCovers, oxapayIsPaid } from "@/lib/oxapay";

const db = supabaseAdmin as any;

export async function oxapaySettings(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const { data } = await db
    .from("bot_settings")
    .select("key,value")
    .in("key", ["oxapay_enabled", "oxapay_api_key", "notify_email", "bot_name", "site_url"]);
  for (const r of data ?? []) map[r.key as string] = String(r.value ?? "").trim();
  return map;
}

export type OxaSettle = { ok: boolean; kind?: "website" | "bot"; orderNo?: number; reason?: string };

export async function settleOxapay(trackId: string): Promise<OxaSettle> {
  const settings = await oxapaySettings();
  const { oxapayKey, oxapayPaymentInfo } = await import("@/lib/oxapay.server");
  const key = oxapayKey(settings);
  if (!key) return { ok: false, reason: "OxaPay is not configured." };
  const r = await oxapayPaymentInfo(key, trackId);
  if (!r.ok) return { ok: false, reason: r.error };
  const info = r.info;

  if (info.orderId.startsWith("W-")) return settleWebsite(info, settings);
  if (info.orderId.startsWith("D-")) {
    const { settleOxapayBotDeposit } = await import("@/lib/bot/engine.server");
    const b = await settleOxapayBotDeposit(info.orderId.slice(2), info);
    return { ok: b.ok, kind: "bot", reason: b.reason };
  }
  return { ok: false, reason: "Unknown OxaPay order reference." };
}

async function settleWebsite(info: import("@/lib/oxapay.server").OxapayInfo, settings: Record<string, string>): Promise<OxaSettle> {
  const orderId = info.orderId.slice(2);
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.payment_method !== "oxapay" && !(order.meta as any)?.oxapay_track_id)
    return { ok: false, kind: "website", reason: "Order not found for this payment." };
  // The invoice must be the one we created for this order.
  if ((order.meta as any)?.oxapay_track_id !== info.trackId)
    return { ok: false, kind: "website", orderNo: order.order_no, reason: "Payment does not belong to this order." };
  if ((order.meta as any)?.oxapay_paid) return { ok: true, kind: "website", orderNo: order.order_no };
  if (!oxapayIsPaid(info.status))
    return { ok: false, kind: "website", orderNo: order.order_no, reason: `Payment not confirmed yet (status: ${info.status || "pending"}).` };
  if (info.currency && info.currency !== "USD")
    return { ok: false, kind: "website", orderNo: order.order_no, reason: "Unexpected invoice currency." };
  if (!oxapayCovers(info.amount, Number(order.total ?? 0)))
    return { ok: false, kind: "website", orderNo: order.order_no, reason: "Paid amount is lower than the order total." };

  const { error: usedErr } = await db.from("binance_used_txs").insert({ tx_id: `oxapay:${info.trackId}` });
  if (usedErr) return { ok: true, kind: "website", orderNo: order.order_no };

  const meta = { ...((order.meta as any) ?? {}), oxapay_paid: true, oxapay_coin: info.coin, oxapay_tx: info.txHash, paid_at: new Date().toISOString() };
  await db.from("orders").update({ meta }).eq("id", order.id);

  const { autoDeliver, sendPaidEmails } = await import("@/lib/eps-settle.server");
  await autoDeliver({ ...order, meta });
  await sendPaidEmails(order, settings, info.coin, "OxaPay");
  return { ok: true, kind: "website", orderNo: order.order_no };
}
