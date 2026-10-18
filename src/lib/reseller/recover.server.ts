// Recover reseller API orders that were recorded but never charged (the
// request died between "reserve order" and "debit wallet"). Charge now and
// deliver own stock; if balance or stock is missing, cancel (nothing to refund).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;
const MIN_AGE_MS = 45_000;

export async function recoverUnchargedResellerOrders(onlyId?: string): Promise<number> {
  let q = db
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .eq("payment_method", "reseller_balance")
    .not("reseller_id", "is", null)
    .not("external_ref", "is", null)
    .is("delivered_content", null)
    .lt("created_at", new Date(Date.now() - MIN_AGE_MS).toISOString())
    .gt("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
    .limit(20);
  if (onlyId) q = q.eq("id", onlyId);
  const { data: rows } = await q;
  let done = 0;
  for (const o of (rows ?? []) as any[]) {
    const meta = o.meta ?? {};
    if (meta.supplier_failed || meta.recovered) continue;
    // Was it charged? Reference = external_ref when one was sent.
    const { data: tx } = await db
      .from("reseller_transactions")
      .select("id")
      .eq("reseller_id", o.reseller_id)
      .eq("reference", o.external_ref)
      .limit(1);
    if ((tx ?? []).length) continue;
    // Claim the row so parallel ticks never process it twice.
    const { data: claimed } = await db
      .from("orders")
      .update({ meta: { ...meta, recovered: "processing" } })
      .eq("id", o.id)
      .eq("status", "pending")
      .is("meta->recovered", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { data: p } = await db
      .from("products")
      .select("id,delivery_type,supplier_id,supplier_external_id")
      .eq("id", o.product_id)
      .maybeSingle();
    const supplierLinked = Boolean(p?.supplier_id && p?.supplier_external_id);
    // Own auto-stock and supplier-linked products are recovered automatically.
    if (!p || (!supplierLinked && p.delivery_type !== "auto")) {
      await db.from("orders").update({ meta: { ...meta, recovered: "skipped" } }).eq("id", o.id);
      continue;
    }

    const total = Number(o.total);
    const { error: debitErr } = await db.rpc("reseller_adjust_balance", {
      _reseller_id: o.reseller_id,
      _amount: -total,
      _type: "order",
      _reference: o.external_ref,
      _note: `${o.quantity}× ${o.product_name}`,
    });
    if (debitErr) {
      await db
        .from("orders")
        .update({ status: "cancelled", meta: { ...meta, recovered: "no_balance" } })
        .eq("id", o.id);
      continue;
    }

    if (supplierLinked) {
      // Charged now; buy from the supplier. Success completes the order and
      // pushes the reseller webhook; failure stays pending for admin Retry.
      await db.from("orders").update({ meta: { ...meta, recovered: "charged" } }).eq("id", o.id);
      try {
        const { retrySupplierDelivery } = await import("@/lib/suppliers/fulfil.server");
        const r = await retrySupplierDelivery(String(o.id));
        if (r.ok) done++;
      } catch (e) {
        console.error("reseller recovery supplier delivery failed", o.id, e);
      }
      continue;
    }

    const { fulfillChargedResellerStock } = await import("./charged-stock.server");
    const result = await fulfillChargedResellerStock(o.id);
    if (result.status === "out_of_stock") {
      await db.rpc("reseller_adjust_balance", {
        _reseller_id: o.reseller_id,
        _amount: total,
        _type: "refund",
        _reference: o.external_ref,
        _note: "Refund: out of stock",
      });
      await db
        .from("orders")
        .update({ status: "cancelled", meta: { ...meta, recovered: "out_of_stock" } })
        .eq("id", o.id);
      continue;
    }

    if (result.status !== "completed" || !result.changed) continue;
    const { data: order } = await db.from("orders").select("*").eq("id", o.id).maybeSingle();
    done++;
    try {
      const { pushResellerOrderEvent } = await import("@/lib/reseller/webhook.server");
      if (order) await pushResellerOrderEvent(String(o.reseller_id), order);
    } catch {
      /* webhook failure must not undo delivery */
    }
  }
  return done;
}
