// Verifies a website checkout's customer-typed TXID / Binance Order ID against
// real Binance history. Result is stored in orders.meta.binance so admins see
// "found / not found" before delivering. A verified ID is claimed in
// binance_used_txs so the same payment can never be reused by another order.
import { exactBinanceAmount } from "@/lib/binance-payment";
import { paymentAttemptOpen } from "@/lib/payment-deadline";

export type WebsiteBinanceCheck = {
  status: "verified" | "not_found" | "mismatch" | "used" | "error";
  amount?: number;
  currency?: string;
  checked_at: string;
  note?: string;
};

export async function verifyWebsiteOrderTxid(orderId: string): Promise<WebsiteBinanceCheck | null> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: o } = await db.from("orders").select("id,source,txid,total,payment_method,meta,status,created_at").eq("id", orderId).maybeSingle();
  if (!o || o.source !== "website" || !o.txid) return null;
  if (String(o.payment_method).startsWith("chain_")) {
    const { verifyBlockchainWebsiteOrder } = await import("@/lib/blockchain-settle.server");
    return verifyBlockchainWebsiteOrder(orderId);
  }
  if (o.payment_method === "bybit") {
    const { verifyBybitWebsiteOrder } = await import("@/lib/bybit-settle.server");
    return verifyBybitWebsiteOrder(orderId);
  }
  const meta = (o.meta ?? {}) as Record<string, any>;
  if (!["binance", "usdt_BSC", "usdt_TRX", "usdt_bep20", "usdt_trc20"].includes(o.payment_method ?? "")) return null;
  if (meta["binance"]?.status === "verified") {
    const { fulfillWebsiteOrder } = await import("@/lib/website-fulfillment.server");
    await fulfillWebsiteOrder(orderId);
    return meta["binance"] as WebsiteBinanceCheck;
  }
  if (!paymentAttemptOpen(o)) return { status: "error", checked_at: new Date().toISOString(), note: "Payment expired; automatic settlement disabled." };

  const txId = String(o.txid).trim();
  const kind = o.payment_method === "binance" ? "pay" : "crypto";
  const now = new Date().toISOString();
  let result: WebsiteBinanceCheck;
  try {
    const { findByTxId } = await import("@/lib/binance.server");
    const m = await findByTxId(txId, kind, Date.parse(o.created_at));
    if (!m.ok) {
      result = m.error ? { status: "error", checked_at: now, note: m.error } : { status: "not_found", checked_at: now };
    } else if (m.currency !== "USDT") {
      result = { status: "mismatch", amount: m.amount, currency: m.currency, checked_at: now, note: "Not USDT" };
    } else if (!exactBinanceAmount(Number(o.total), m.amount)) {
      result = { status: "mismatch", amount: m.amount, currency: m.currency, checked_at: now, note: `Expected ${Number(o.total)} USDT` };
    } else {
      const { error } = await db.rpc("settle_verified_website_payment", {
        _order_id: orderId, _gateway: "binance", _amount: m.amount, _reference: txId,
      });
      result = error
        ? { status: "error", amount: m.amount, currency: m.currency, checked_at: now, note: "Payment settlement unavailable or ID already used." }
        : { status: "verified", amount: m.amount, currency: m.currency, checked_at: now };
    }
  } catch (e) {
    result = { status: "error", checked_at: now, note: e instanceof Error ? e.message : "Binance unreachable" };
  }
  if (result.status === "verified") {
    const { fulfillWebsiteOrder } = await import("@/lib/website-fulfillment.server");
    await fulfillWebsiteOrder(orderId);
  } else {
    // A failed check must not replace a concurrent verified settlement.
    await db.from("orders").update({ meta: { ...meta, binance: result } as any }).eq("id", o.id)
      .eq("status", "pending").is("meta->>paid", null).is("meta->binance->>status", null);
  }
  return result;
}
