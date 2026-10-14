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

/** Ambiguous failures (timeout/network) may already be charged, so they are never retried automatically. */
function isAmbiguousFailure(msg: string) {
  return /timeout|timed out|abort|network|fetch failed|ECONN|socket|5\d\d/i.test(msg);
}

/**
 * Supplier purchase with one automatic retry a few seconds later. Both attempts
 * use the same reference, and only clear rejections are retried, so one order
 * can never be bought twice.
 */
export async function supplierOrderWithRetry(
  sup: any,
  externalId: string,
  qty: number,
  ref: string,
  opts?: { customerEmail?: string | null },
) {
  const { supplierOrder } = await import("@/lib/suppliers/api.server");
  try {
    const res = await supplierOrder(sup, externalId, qty, ref, opts as any);
    if (res.items.length) return res;
    throw new Error(`Supplier accepted the order but returned no items${res.code ? ` (ref ${res.code})` : ""}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isAmbiguousFailure(msg) || /returned no items/.test(msg)) throw e;
    await new Promise((r) => setTimeout(r, 5000));
    return await supplierOrder(sup, externalId, qty, ref, opts as any);
  }
}

/** Store (or clear) the last supplier failure on the order so admins see it in Orders. */
export async function recordSupplierError(orderId: string, reason: string | null) {
  const { data: o } = await db.from("orders").select("meta").eq("id", orderId).maybeSingle();
  const meta = { ...((o?.meta as any) ?? {}) };
  if (reason) {
    meta.supplier_error = reason.slice(0, 500);
    meta.supplier_error_at = new Date().toISOString();
  } else {
    delete meta.supplier_error;
    delete meta.supplier_error_at;
  }
  await db.from("orders").update({ meta }).eq("id", orderId);
}


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
    const res = await supplierOrderWithRetry(
      sup as any,
      String(product.supplier_external_id),
      Number(order.quantity ?? 1),
      `qorix-retry-${order.id}-${Date.now()}`,
      { customerEmail: (order as any).customer_email ?? null },
    );

    const content = res.items.join("\n---\n");
    const meta = { ...((order.meta as any) ?? {}) };
    delete meta.supplier_error;
    delete meta.supplier_error_at;
    await db.from("orders").update({ status: "completed", delivered_content: content, meta }).eq("id", order.id);
    // Bot orders are announced by the bot flow; website orders are announced here.
    if ((order as any).source === "website") {
      const { announceOrderSale } = await import("@/lib/bot/engine.server");
      await announceOrderSale(String(order.id));
    }

    // The purchase is already paid for and stored — a Telegram hiccup must not
    // report the delivery as failed.
    if (order.telegram_id) {
      try {
        const { sendMessage } = await import("@/lib/telegram.server");
        const { deliverItemsToChat } = await import("@/lib/bot/deliver-items.server");
        await sendMessage(
          order.telegram_id,
          `✅ <b>Order #${order.order_no}</b> delivered!\n${order.quantity}× ${esc(order.product_name)}\n` +
            `Sending <b>${res.items.length}</b> item(s) below 👇`,
        );
        await deliverItemsToChat(order.telegram_id, order.product_name, res.items, {
          orderNo: order.order_no,
          orderId: order.id,
        });
      } catch (sendErr) {
        console.error("Delivery saved but Telegram send failed:", sendErr);
      }
    }

    // Reseller API order: tell the reseller in Telegram and push to their webhook
    // so their own bot/site can deliver to their customer.
    if ((order as any).reseller_id) {
      const rid = String((order as any).reseller_id);
      try {
        const { data: r } = await db.from("resellers").select("telegram_id").eq("id", rid).maybeSingle();
        if (r?.telegram_id) {
          const { sendMessage } = await import("@/lib/telegram.server");
          await sendMessage(
            r.telegram_id,
            `✅ <b>API order #${order.order_no}</b> completed\n${order.quantity}× ${esc(order.product_name)}` +
              `${order.external_ref ? `\nRef: <code>${esc(order.external_ref)}</code>` : ""}\n` +
              `Items are now available via GET /orders/${order.id}.`,
          );
        }
      } catch (e) {
        console.error("Reseller Telegram notice failed:", e);
      }
      const { pushResellerOrderEvent } = await import("@/lib/reseller/webhook.server");
      await pushResellerOrderEvent(rid, { ...order, status: "completed", delivered_content: content });
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
    const reason = pre.ok ? msg : `${msg} — ${pre.reason}`;
    try { await recordSupplierError(String(order.id), reason); } catch { /* display only */ }
    return { ok: false, reason };
  }


}
