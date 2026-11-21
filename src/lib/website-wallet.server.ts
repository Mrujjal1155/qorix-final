import { supabaseAdmin as db } from "@/integrations/supabase/client.server";

/** Persist the charged order first; only one request can own an external purchase attempt. */
export async function deliverWebsiteWalletOrder(orderId: string) {
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.payment_method !== "wallet" || !(order.meta as any)?.paid) return;
  const { data: product } = await db.from("products").select("*").eq("id", order.product_id ?? "").maybeSingle();
  if (!product || product.delivery_type === "manual") return;
  if (order.status === "completed") return;
  if (!product.supplier_id || !product.supplier_external_id) return;
  // Conditional status claim is durable. An interrupted/uncertain attempt remains for admin review.
  const { data: claimed } = await db.from("orders").update({ meta: { ...((order.meta as any) ?? {}), wallet_supplier_attempt: true } })
    .eq("id", orderId).eq("status", "pending").is("meta->>wallet_supplier_attempt", null).select("id").maybeSingle();
  if (!claimed) return;
  try {
    const { supplierOrder } = await import("@/lib/suppliers/api.server");
    const { data: supplier } = await db.from("suppliers").select("*").eq("id", product.supplier_id).eq("is_enabled", true).maybeSingle();
    if (!supplier) throw new Error("Product unavailable");
    const result = await supplierOrder(supplier as any, product.supplier_external_id, order.quantity, `website-wallet-${orderId}`);
    if (result.items.length !== order.quantity) {
      await db.from("orders").update({ meta: { ...((order.meta as any) ?? {}), wallet_supplier_attempt: true, wallet_delivery_review: true, wallet_partial_items: result.items } }).eq("id", orderId);
      return;
    }
    const { error } = await db.from("orders").update({ status: "completed", delivered_content: result.items.join("\n---\n") }).eq("id", orderId).eq("status", "pending");
    if (error) throw error;
    const { sendWebsiteOrderDelivery } = await import("@/lib/website-order-delivery.server");
    await sendWebsiteOrderDelivery(orderId).catch(() => false);
  } catch (error) {
    console.error("[website-wallet] delivery needs review", orderId, error);
    // Never replay an uncertain supplier buy. The paid row and wallet debit remain visible.
  }
}