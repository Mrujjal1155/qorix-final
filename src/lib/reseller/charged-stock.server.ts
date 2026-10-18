import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

/** Stock claim and order completion commit together; this function never debits. */
export async function fulfillChargedResellerStock(orderId: string) {
  const { data, error } = await db.rpc("fulfill_charged_reseller_stock", { _order_id: orderId });
  if (error) throw new Error("Stock delivery could not be saved; automatic recovery will retry.");
  return data as { status: string; changed?: boolean; quantity?: number };
}

export async function recoverChargedResellerStock(onlyId?: string): Promise<number> {
  let query = db.from("orders").select("id,reseller_id")
    .eq("status", "pending").eq("payment_method", "reseller_balance")
    .not("reseller_id", "is", null).is("delivered_content", null)
    .lt("created_at", new Date(Date.now() - 45_000).toISOString())
    .order("created_at", { ascending: true }).limit(20);
  if (onlyId) query = query.eq("id", onlyId);
  const { data: orders, error } = await query;
  if (error) throw new Error("Pending stock orders could not be read.");
  let completed = 0;
  for (const order of orders ?? []) {
    try {
      const result = await fulfillChargedResellerStock(order.id);
      if (result.status !== "completed" || !result.changed) continue;
      completed++;
      const { data: saved } = await db.from("orders").select("*").eq("id", order.id).maybeSingle();
      if (saved) {
        const { pushResellerOrderEvent } = await import("./webhook.server");
        await pushResellerOrderEvent(order.reseller_id, saved);
      }
    } catch {
      console.error("Charged reseller stock recovery will retry", order.id);
    }
  }
  return completed;
}