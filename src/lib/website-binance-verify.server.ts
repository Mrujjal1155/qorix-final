// Verifies a website checkout's customer-typed TXID / Binance Order ID against
// real Binance history. Result is stored in orders.meta.binance so admins see
// "found / not found" before delivering. A verified ID is claimed in
// binance_used_txs so the same payment can never be reused by another order.
import { exactBinanceAmount } from "@/lib/binance-payment";

export type WebsiteBinanceCheck = {
  status: "verified" | "not_found" | "mismatch" | "used" | "error";
  amount?: number;
  currency?: string;
  checked_at: string;
  note?: string;
};

export async function verifyWebsiteOrderTxid(orderId: string): Promise<WebsiteBinanceCheck | null> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: o } = await db.from("orders").select("id,source,txid,total,payment_method,meta,status").eq("id", orderId).maybeSingle();
  if (!o || o.source !== "website" || !o.txid) return null;
  const meta = (o.meta ?? {}) as Record<string, any>;
  if (meta["binance"]?.status === "verified") return meta["binance"] as WebsiteBinanceCheck;

  const txId = String(o.txid).trim();
  const kind = o.payment_method === "binance" ? "pay" : "crypto";
  const now = new Date().toISOString();
  let result: WebsiteBinanceCheck;
  try {
    const { findByTxId } = await import("@/lib/binance.server");
    const m = await findByTxId(txId, kind);
    if (!m.ok) {
      result = m.error ? { status: "error", checked_at: now, note: m.error } : { status: "not_found", checked_at: now };
    } else if (m.currency !== "USDT") {
      result = { status: "mismatch", amount: m.amount, currency: m.currency, checked_at: now, note: "Not USDT" };
    } else if (!exactBinanceAmount(Number(o.total), m.amount)) {
      result = { status: "mismatch", amount: m.amount, currency: m.currency, checked_at: now, note: `Expected ${Number(o.total)} USDT` };
    } else {
      const { error } = await db.from("binance_used_txs").insert({ tx_id: txId });
      result = error
        ? { status: "used", amount: m.amount, currency: m.currency, checked_at: now, note: "ID already used by another payment" }
        : { status: "verified", amount: m.amount, currency: m.currency, checked_at: now };
    }
  } catch (e) {
    result = { status: "error", checked_at: now, note: e instanceof Error ? e.message : "Binance unreachable" };
  }
  await db.from("orders").update({ meta: { ...meta, binance: result } as any }).eq("id", o.id);
  return result;
}
