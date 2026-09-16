// Server-only helper that (re)tries automatic supplier fulfilment for one order.
// Used by the bot admin panel ("Retry API delivery") and the website admin orders page.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

function esc(t: string) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type SupplierPreflight = { ok: boolean; reason?: string | undefined; balance?: number | undefined; currency?: string | undefined };

/** Resolve the supplier's own unit cost; customer selling prices must never be used here. */
export async function supplierUnitCost(
  productId: string,
  supplierId: string,
  externalId: string,
  liveCost?: number,
): Promise<number | null> {
  if (Number.isFinite(liveCost) && Number(liveCost) > 0) return Number(liveCost);

  const exact = await db
    .from("supplier_products")
    .select("cost_price")
    .eq("supplier_id", supplierId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (Number(exact.data?.cost_price) > 0) return Number(exact.data.cost_price);

  const linked = await db
    .from("supplier_products")
    .select("cost_price")
    .eq("product_id", productId)
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(linked.data?.cost_price) > 0 ? Number(linked.data.cost_price) : null;
}

/** Check the supplier wallet the API key sees, so "insufficient balance" is reported clearly. */
export async function supplierPreflight(supplier: any, needed: number): Promise<SupplierPreflight> {
  try {
    const { supplierBalance } = await import("@/lib/suppliers/api.server");
    const bal = await supplierBalance(supplier);
    if (Number(bal.balance) + 1e-9 < needed) {
      return {
        ok: false,
        balance: Number(bal.balance),
        currency: bal.currency,
        reason:
          `Supplier API wallet balance is ${bal.balance} ${bal.currency}, but this order needs about ` +
          `${needed.toFixed(2)} ${bal.currency}. Top up the reseller/API account that owns this API key ` +
          `(bot wallet balance does not count).`,
      };
    }
    return { ok: true, balance: Number(bal.balance), currency: bal.currency };
  } catch (e) {
    // Balance endpoint problems must not block the actual order attempt.
    return { ok: true, reason: e instanceof Error ? e.message : String(e) };
  }
}

export type RetryResult = { ok: boolean; reason?: string | undefined; items?: string[] | undefined };

/** Re-run the supplier API purchase for a pending order and deliver on success. */
export async function retrySupplierDelivery(orderId: string): Promise<RetryResult> {
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, reason: "Order not found" };
  if (order.status === "completed") return { ok: false, reason: "Order is already completed" };

  const { data: product } = await db
    .from("products")
    .select("id,name,supplier_id,supplier_external_id")
    .eq("id", String(order.product_id ?? ""))
    .maybeSingle();
  if (!product?.supplier_id || !product.supplier_external_id)
    return { ok: false, reason: "This product is not linked to a supplier API — deliver it manually." };

  // Always order against the supplier's live id/stock/cost, never a stale snapshot.
  let liveCost: number | undefined;
  try {
    const { refreshLiveStock } = await import("@/lib/suppliers/live-stock.server");
    const live = await refreshLiveStock(String(product.id), 8000);
    if (live) {
      product.supplier_external_id = live.external_id;
      liveCost = live.price;
    }
  } catch {
    /* fall back to the stored id */
  }

  const { data: sup } = await db.from("suppliers").select("*").eq("id", product.supplier_id).maybeSingle();
  if (!sup) return { ok: false, reason: "Supplier record not found" };
  if (!sup.is_enabled) return { ok: false, reason: `Supplier “${sup.name ?? sup.key}” is disabled in admin` };

  // Advisory only: some supplier balance endpoints under-report (or return 0)
  // even when the API wallet is funded, so never block the purchase on it —
  // the supplier API itself is the authority and rejects unfunded orders.
  const supplierCost = await supplierUnitCost(
    String(product.id),
    String(product.supplier_id),
    String(product.supplier_external_id),
    liveCost,
  );
  const pre = supplierCost
    ? await supplierPreflight(sup, supplierCost * Number(order.quantity ?? 1))
    : { ok: true };

  try {
    const { supplierOrder } = await import("@/lib/suppliers/api.server");
    const res = await supplierOrder(
      sup as any,
      String(product.supplier_external_id),
      Number(order.quantity ?? 1),
      `qorix-retry-${order.id}-${Date.now()}`,
      { customerEmail: (order as any).customer_email ?? null },
    );

    if (!res.items.length)
      return {
        ok: false,
        reason: `Supplier accepted the order but returned no items${res.code ? ` (ref ${res.code})` : ""}`,
      };

    const content = res.items.join("\n---\n");
    await db.from("orders").update({ status: "completed", delivered_content: content }).eq("id", order.id);

    // The purchase is already paid for and stored — a Telegram hiccup must not
    // report the delivery as failed.
    if (order.telegram_id) {
      try {
        const { sendMessage } = await import("@/lib/telegram.server");
        await sendMessage(
          order.telegram_id,
          `✅ <b>Order #${order.order_no}</b> delivered!\n${order.quantity}× ${esc(order.product_name)}\n` +
            `Sending <b>${res.items.length}</b> item(s) below 👇`,
        );
        for (let i = 0; i < res.items.length; i++) {
          await sendMessage(
            order.telegram_id,
            `📦 <b>${esc(order.product_name)} — ${i + 1} of ${res.items.length}</b>\n<pre>${esc(res.items[i]!)}</pre>`,
          );
        }
      } catch (sendErr) {
        console.error("Delivery saved but Telegram send failed:", sendErr);
      }
    }

    return { ok: true, items: res.items };
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    // The most common supplier failure: the item's id changed on their side.
    // Say so in plain words instead of echoing the raw API sentence.
    if (/product not found|not\s*found|invalid product/i.test(msg)) {
      msg =
        `Supplier no longer has this product id (it was replaced with a new batch). ` +
        `Run "Sync catalogue" for ${sup.name ?? sup.key} and retry, or deliver manually. [${msg}]`;
    }
    return { ok: false, reason: pre.ok ? msg : `${msg} — ${pre.reason}` };
  }


}
