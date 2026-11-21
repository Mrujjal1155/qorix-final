import { deliveryItems } from "@/lib/delivery-items";

export type WebsiteDeliveryOrder = {
  id: string; source: string | null; status: string; telegram_id: number | null;
  reseller_id: string | null; delivered_content: string | null; product_name: string;
  order_no: number; quantity: number; total: number; payment_method: string | null;
};

export function websiteDeliveryEligible(order: WebsiteDeliveryOrder, recipient: number): boolean {
  return order.source === "website" && order.status === "completed" && !order.reseller_id &&
    Number.isSafeInteger(recipient) && recipient > 0 && Number(order.telegram_id) === recipient &&
    deliveryItems(order.delivered_content).length > 0;
}

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function websiteDeliverySummary(order: WebsiteDeliveryOrder): string {
  return `✅ <b>COMPLETED</b>\n\n` +
    `📦 <b>Order:</b> ${order.quantity}× ${esc(order.product_name.slice(0, 500))}\n` +
    `📄 <b>Order ID:</b> #${order.order_no} · <code>ORD-${order.id.slice(0, 8).toUpperCase()}</code>\n` +
    `💰 <b>Total:</b> $${Number(order.total).toFixed(2)} · ${esc((order.payment_method ?? "").slice(0, 100))}\n\n` +
    `Payment verified and your order is complete. Your items are below.`;
}