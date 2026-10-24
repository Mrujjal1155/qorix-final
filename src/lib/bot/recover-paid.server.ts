// Server-only: auto-deliver paid own-stock orders whose delivery step never ran
// (e.g. the request was cut off right after the payment was confirmed).
// Runs from the 15-second notify schedule. Safe to run repeatedly: stock is
// claimed atomically and the order is only completed while still pending.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;
const MIN_AGE_MS = 2 * 60_000;

export async function recoverPaidOrders(limit = 10): Promise<{ checked: number; delivered: number }> {
  const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString();
  const { data: rows } = await db
    .from("orders")
    .select("id,order_no,telegram_id,product_id,product_name,quantity,meta,updated_at")
    .eq("status", "pending")
    .eq("meta->>paid", "true")
    .lt("updated_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);

  let delivered = 0;
  for (const o of rows ?? []) {
    try {
      if (!o.product_id) continue;
      const { data: p } = await db
        .from("products")
        .select("id,delivery_type,supplier_id,supplier_external_id")
        .eq("id", o.product_id)
        .maybeSingle();
      if (!p || p.delivery_type !== "auto" || p.supplier_id) continue;

      // Share the same order lock with admin Retry; never claim stock separately.
      const { retryInhouseDelivery } = await import("@/lib/inhouse-retry.server");
      const result = await retryInhouseDelivery(String(o.id));
      if (result.ok) delivered++;
    } catch (e) {
      console.error(`[recover] order #${o.order_no} failed:`, e);
    }
  }
  return { checked: rows?.length ?? 0, delivered };
}
