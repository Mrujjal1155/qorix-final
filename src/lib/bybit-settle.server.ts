import { bybitTransactionKey } from "@/lib/bybit-payment";
import { findBybitPayment } from "@/lib/bybit.server";

export async function verifyBybitWebsiteOrder(orderId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).eq("source", "website").eq("payment_method", "bybit").maybeSingle();
  if (!order || !order.txid || order.status !== "pending") return null;
  const meta = (order.meta ?? {}) as Record<string, any>;
  if (meta["paid"] === true) return { status: "verified" as const };
  const created = Date.parse(order.created_at);
  // Website payment occurs before order submission: bounded 30-minute grace, never arbitrary historical payments.
  const match = await findBybitPayment({ txid: order.txid, amount: Number(order.total), since: created - 30 * 60_000, until: Math.min(Date.now(), created + 30 * 60_000) });
  if (!match.ok) {
    const result = { status: "not_found", checked_at: new Date().toISOString(), note: match.reason };
    await db.from("orders").update({ meta: { ...meta, bybit: result } }).eq("id", order.id).eq("status", "pending");
    return result;
  }
  const { data: settled, error } = await db.rpc("settle_bybit_website", { _order_id: order.id, _txid: match.txid, _amount: match.amount });
  if (error) return { status: "error", note: "Payment settlement unavailable or transaction already used." };
  if (settled && typeof settled === "object" && "changed" in settled && settled.changed) {
    const { autoDeliver } = await import("@/lib/eps-settle.server");
    await autoDeliver({ ...order, meta: { ...meta, paid: true } });
  }
  return { status: "verified" as const };
}

export async function sweepBybitWebsiteOrders() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db.from("orders").select("id,meta").eq("source", "website").eq("payment_method", "bybit").eq("status", "pending")
    .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString()).order("created_at").limit(10);
  for (const order of data ?? []) {
    const meta = order.meta as Record<string, any> | null;
    if (meta?.["paid"] !== true) await verifyBybitWebsiteOrder(order.id);
  }
}

export async function confirmBybitBotDeposit(row: any, txid: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: used, error } = await db.from("binance_used_txs").select("tx_id").eq("tx_id", bybitTransactionKey(txid)).maybeSingle();
  if (error) return { ok: false as const, message: "Payment verification unavailable. Please retry." };
  if (used) return { ok: false as const, message: "This Bybit transaction was already used." };
  const match = await findBybitPayment({ txid, amount: Number(row.amount_usdt), since: Date.parse(row.created_at), until: Math.min(Date.now(), Date.parse(row.expires_at)) });
  return match.ok ? { ok: true as const, amount: match.amount, txId: match.txid } : { ok: false as const, notFound: true, message: match.reason };
}