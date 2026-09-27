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

      const qty = Number(o.quantity ?? 1);
      const buyer = Number(o.telegram_id) || 0;
      const { data: items } = await db.rpc("claim_stock_items", { _product_id: p.id, _qty: qty, _sold_to: buyer });
      const claimed = (items ?? []) as any[];
      const release = async () => {
        if (claimed.length)
          await db.from("stock_items").update({ is_sold: false, sold_to: null, sold_at: null }).in("id", claimed.map((i) => i.id));
      };
      if (claimed.length < qty) {
        await release();
        continue;
      }
      const contents = claimed.map((i) => String(i.content));
      const { data: done } = await db
        .from("orders")
        .update({
          status: "completed",
          delivered_content: contents.join("\n---\n"),
          meta: { ...((o.meta as any) ?? {}), auto_recovered_at: new Date().toISOString() },
        })
        .eq("id", o.id)
        .eq("status", "pending")
        .select("id");
      if (!done?.length) {
        await release();
        continue;
      }
      delivered++;
      if (buyer) {
        try {
          const { sendMessage } = await import("@/lib/telegram.server");
          const { deliverItemsToChat } = await import("@/lib/bot/deliver-items.server");
          await sendMessage(buyer, `✅ <b>Order #${o.order_no}</b> delivered!\nSending <b>${contents.length}</b> item(s) below 👇`);
          await deliverItemsToChat(buyer, String(o.product_name ?? ""), contents, { orderNo: o.order_no, orderId: o.id });
        } catch (e) {
          console.error(`[recover] telegram send failed for #${o.order_no}:`, e);
        }
      }
      try {
        const { announceOrderSale } = await import("@/lib/bot/engine.server");
        await announceOrderSale(String(o.id));
      } catch { /* announcement is best effort */ }
    } catch (e) {
      console.error(`[recover] order #${o.order_no} failed:`, e);
    }
  }
  return { checked: rows?.length ?? 0, delivered };
}
