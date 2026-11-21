import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { websiteDeliveryEligible, websiteDeliverySummary, type WebsiteDeliveryOrder } from "@/lib/website-order-delivery";
import { deliveryItems } from "@/lib/delivery-items";
import { deliverItemsToChat } from "@/lib/bot/deliver-items.server";
import { sendMessage } from "@/lib/telegram.server";

// The completion trigger queues only new website deliveries. No historical fan-out.
const db = supabaseAdmin as any;

export async function sendWebsiteOrderDelivery(orderId?: string): Promise<boolean> {
  const { data: claims, error } = await db.rpc("claim_website_order_delivery", { _order_id: orderId ?? null });
  const claim = claims?.[0];
  if (error || !claim) return false;
  const finish = async (values: Record<string, unknown>) => {
    const result = await db.from("website_order_deliveries").update({ ...values, updated_at: new Date().toISOString() })
      .eq("order_id", claim.order_id).eq("claim_token", claim.claim_token).eq("status", "sending");
    if (result.error) throw new Error("Delivery progress could not be saved");
  };
  try {
    const { data: order, error: readError } = await db.from("orders")
      .select("id,source,status,telegram_id,reseller_id,delivered_content,product_name,order_no,quantity,total,payment_method")
      .eq("id", claim.order_id).maybeSingle();
    if (readError) throw new Error("Delivery order could not be read");
    const recipient = Number(claim.telegram_id);
    if (!order || !websiteDeliveryEligible(order as WebsiteDeliveryOrder, recipient)) {
      await finish({ status: "review" });
      return false;
    }
    if (!claim.summary_sent) {
      const result = await sendMessage(recipient, websiteDeliverySummary(order));
      if (!result?.ok) {
        // Retry only a definitive rejection before any credentials were sent.
        // Network uncertainty and interrupted claims require review, not replay.
        const retry = result?.error_code === 429;
        await finish({ status: retry ? "pending" : "review", next_attempt_at: new Date(Date.now() + Math.max(30, Number(result?.parameters?.retry_after ?? 30)) * 1000).toISOString() });
        return false;
      }
      await finish({ summary_sent: true });
    }
    const items = deliveryItems(order.delivered_content);
    const result = await deliverItemsToChat(recipient, order.product_name, items, { orderNo: order.order_no, orderId: order.id });
    const accepted = result.sent === items.length || result.fallbackFile;
    await finish({ status: accepted ? "sent" : "review" });
    return accepted;
  } catch {
    // A side effect must never undo completion, debit again or repurchase stock.
    // A crash after Telegram accepted a message is ambiguous: do not auto-repeat.
    try { await finish({ status: "review" }); } catch { /* stale sending claims become review on the next claim */ }
    console.error("[website-delivery] Telegram delivery needs review", claim.order_id);
    return false;
  }
}

export async function drainWebsiteOrderDeliveries(): Promise<{ sent: number }> {
  let sent = 0;
  for (let i = 0; i < 2; i++) {
    if (await sendWebsiteOrderDelivery()) sent++;
    else break;
  }
  return { sent };
}