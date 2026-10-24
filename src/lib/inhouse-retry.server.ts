import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

export async function retryInhouseDelivery(orderId: string) {
  const { data: result, error } = await db.rpc("fulfill_paid_inhouse_order", { _order_id: orderId });
  if (error) return { ok: false, reason: "Stock delivery could not be completed. Please retry." };
  if (result?.status !== "completed") {
    const reasons: Record<string, string> = {
      unpaid: "Confirm payment before retrying delivery.",
      refunded: "This order was refunded; delivery is blocked.",
      out_of_stock: "Not enough available stock. Add stock and retry.",
      missing: "Order not found.",
      ineligible: "This order cannot use automatic in-house delivery.",
    };
    return { ok: false, reason: reasons[result?.status] ?? "Delivery unavailable." };
  }
  const { data: order, error: readError } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (readError || !order?.delivered_content) return { ok: false, reason: "Delivery saved; reload the order and retry." };
  const items = String(order.delivered_content).split("\n---\n");
  if (order.telegram_id && order.source !== "website") {
    try {
      const { deliverItemsToChat } = await import("@/lib/bot/deliver-items.server");
      const sent = await deliverItemsToChat(order.telegram_id, order.product_name, items, {
        orderNo: order.order_no, orderId: order.id,
      });
      if (sent.failed > 0 && !sent.fallbackFile) return { ok: false, reason: "Accounts saved, but Telegram delivery failed. Retry sends the same accounts." };
    } catch {
      return { ok: false, reason: "Accounts saved, but Telegram delivery failed. Retry sends the same accounts." };
    }
  }
  if (result.changed) {
    try {
      const { announceOrderSale } = await import("@/lib/bot/engine.server");
      await announceOrderSale(orderId);
    } catch { /* Delivery must not depend on the sale announcement. */ }
  }
  return { ok: true, items };
}