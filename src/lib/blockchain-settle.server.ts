import { chainSchema, chainTxid } from "@/lib/blockchain-payment";
import { findChainPayment } from "@/lib/blockchain.server";

export async function confirmBlockchainBotDeposit(row: any, rawTxid: string) {
  if (row.status !== "pending" || Date.parse(row.expires_at) <= Date.now()) return { ok: false as const, message: "This blockchain payment request expired." };
  const network = chainSchema.parse(String(row.kind).replace("chain_", ""));
  let txid: string;
  try { txid = chainTxid(network, rawTxid); } catch { return { ok: false as const, message: "Enter a valid blockchain TXID." }; }
  const result = await findChainPayment(network, { txid, amount: String(row.amount_usdt), address: row.address, since: Date.parse(row.created_at), until: Math.min(Date.now(), Date.parse(row.expires_at)) });
  return result.ok ? { ok: true as const, amount: result.amount, txId: result.txid } : { ok: false as const, notFound: true, message: result.reason };
}
export async function verifyBlockchainWebsiteOrder(orderId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).eq("source", "website").in("payment_method", ["chain_trc20", "chain_bep20"]).maybeSingle();
  if (!order || !order.txid || order.status !== "pending") return null;
  const meta = (order.meta ?? {}) as Record<string, any>;
  if (meta["paid"] === true) return { status: "verified" as const, checked_at: new Date().toISOString() };
  const network = chainSchema.parse(String(order.payment_method).replace("chain_", ""));
  const created = Date.parse(order.created_at);
  const result = await findChainPayment(network, { txid: order.txid, address: meta["chain_address"] ?? "", amount: String(order.total), since: created - 30 * 60_000, until: Math.min(Date.now(), created + 30 * 60_000) });
  if (!result.ok) {
    await db.rpc("record_blockchain_website_check", { _order_id: order.id, _note: result.reason });
    return { status: "not_found" as const, checked_at: new Date().toISOString(), note: result.reason };
  }
  const { data: settled, error } = await db.rpc("settle_blockchain_website", { _order_id: order.id, _txid: result.txid, _amount: result.amount });
  if (error) return { status: "error" as const, checked_at: new Date().toISOString(), note: "Settlement unavailable or transaction already used." };
  if (settled && typeof settled === "object" && "changed" in settled && settled["changed"]) {
    const { autoDeliver } = await import("@/lib/eps-settle.server");
    await autoDeliver({ ...order, meta: { ...meta, paid: true } });
  }
  return { status: "verified" as const, checked_at: new Date().toISOString() };
}
export async function sweepBlockchainWebsiteOrders() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db.from("orders").select("id,meta").eq("source", "website").in("payment_method", ["chain_trc20", "chain_bep20"]).eq("status", "pending").gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString()).order("created_at").limit(5);
  for (const order of data ?? []) if ((order.meta as any)?.paid !== true) await verifyBlockchainWebsiteOrder(order.id);
}