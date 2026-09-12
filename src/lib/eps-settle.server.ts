// Server-only settlement for EPS hosted-checkout website orders.
//
// The success redirect is never trusted: every call re-verifies the payment
// with EPS, refuses underpayments, and credits a merchant transaction id only
// once (unique row in `binance_used_txs`).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveSiteOrigin } from "@/lib/site-url";

const db = supabaseAdmin as any;

export async function epsSettings(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const { data } = await db
    .from("bot_settings")
    .select("key,value")
    .in("key", [
      "eps_enabled",
      "eps_base",
      "eps_username",
      "eps_password",
      "eps_hash_key",
      "eps_merchant_id",
      "eps_store_id",
      "bdt_rate",
      "notify_email",
      "bot_name",
    ]);
  for (const r of data ?? []) map[r.key as string] = String(r.value ?? "").trim();
  return map;
}

export type EpsSettleResult = { ok: boolean; orderNo?: number; email?: string; reason?: string };

/** Verify with EPS, mark the order paid, then try to deliver it automatically. */
export async function settleEpsPayment(
  merchantTransactionId: string,
  epsTransactionId?: string | null,
): Promise<EpsSettleResult> {
  const mtid = String(merchantTransactionId || "").trim();
  if (!mtid) return { ok: false, reason: "Missing transaction id." };

  const { data: order } = await db.from("orders").select("*").eq("txid", `EPS-${mtid}`).maybeSingle();
  if (!order) return { ok: false, reason: "Order not found for this payment." };
  if (order.status === "completed" || (order.meta as any)?.eps_paid) {
    return { ok: true, orderNo: order.order_no, email: order.customer_email };
  }

  const settings = await epsSettings();
  const { epsConfig, verifyTransaction, isPaid, usdToBdt } = await import("@/lib/eps.server");
  const cfg = epsConfig(settings);

  const v = await verifyTransaction(cfg, { merchantTransactionId: mtid, epsTransactionId });
  if (!v.ok) return { ok: false, orderNo: order.order_no, email: order.customer_email, reason: v.error };
  const info = v.info;
  if (!isPaid(info.status)) {
    return {
      ok: false,
      orderNo: order.order_no,
      email: order.customer_email,
      reason: `Payment is not confirmed yet (status: ${info.status || "pending"}).`,
    };
  }

  const expectedBdt = Number((order.meta as any)?.bdt ?? usdToBdt(Number(order.total ?? 0), cfg.rate));
  if (expectedBdt > 0 && info.amount + 1 < expectedBdt) {
    console.error(`[eps] underpayment on order #${order.order_no}: paid ${info.amount} of ${expectedBdt}`);
    return {
      ok: false,
      orderNo: order.order_no,
      email: order.customer_email,
      reason: `We received ৳${info.amount} but this order needs ৳${expectedBdt.toFixed(2)}.`,
    };
  }

  // Replay protection — one merchant transaction id can only settle once.
  const { error: usedErr } = await db.from("binance_used_txs").insert({ tx_id: `eps:${mtid}` });
  if (usedErr) return { ok: true, orderNo: order.order_no, email: order.customer_email };

  await db
    .from("orders")
    .update({
      meta: {
        ...((order.meta as any) ?? {}),
        eps_paid: true,
        eps_transaction_id: info.epsTransactionId,
        eps_entity: info.financialEntity,
        paid_bdt: info.amount,
        paid_at: new Date().toISOString(),
      },
    })
    .eq("id", order.id);

  await autoDeliver(order);
  await sendPaidEmails(order, settings, info.financialEntity);

  return { ok: true, orderNo: order.order_no, email: order.customer_email };
}

/** Supplier API purchase or in-house stock claim; manual products stay pending. */
async function autoDeliver(order: any) {
  try {
    const { data: product } = await db
      .from("products")
      .select("id,delivery_type,supplier_id,supplier_external_id")
      .eq("id", order.product_id)
      .maybeSingle();
    if (!product) return;

    if (product.supplier_id && product.supplier_external_id) {
      const { retrySupplierDelivery } = await import("@/lib/suppliers/fulfil.server");
      const r = await retrySupplierDelivery(order.id);
      if (!r.ok) console.error(`[eps] supplier delivery pending for #${order.order_no}: ${r.reason}`);
      return;
    }

    if (product.delivery_type === "auto") {
      const { data: items } = await db.rpc("claim_stock_items", {
        _product_id: product.id,
        _qty: Number(order.quantity ?? 1),
        _sold_to: 0,
      });
      const claimed = (items ?? []) as any[];
      if (claimed.length >= Number(order.quantity ?? 1)) {
        await db
          .from("orders")
          .update({ status: "completed", delivered_content: claimed.map((i) => String(i.content)).join("\n---\n") })
          .eq("id", order.id);
      } else if (claimed.length) {
        await db
          .from("stock_items")
          .update({ is_sold: false, sold_to: null, sold_at: null })
          .in("id", claimed.map((i: any) => i.id));
      }
    }
  } catch (e) {
    console.error("[eps] auto delivery failed:", e);
  }
}

/** Buyer receipt + admin notification. Email problems never fail a payment. */
async function sendPaidEmails(order: any, settings: Record<string, string>, entity: string) {
  try {
    const origin = resolveSiteOrigin();
    const siteName = settings["bot_name"] || "Qorix Store";
    const notifyEmail = (settings["notify_email"] || "").trim();
    const { sendResendEmail, getEmailBrand } = await import("@/lib/email/resend.server");
    const { logoUrl } = await getEmailBrand();
    const { orderReceiptEmail, adminNewOrderEmail } = await import("@/lib/email/templates");
    const method = `EPS${entity ? ` · ${entity}` : ""}`;
    const trackUrl = `${origin}/track?order=${order.order_no}&email=${encodeURIComponent(order.customer_email ?? "")}`;

    await Promise.allSettled([
      order.customer_email
        ? sendResendEmail({
            to: order.customer_email,
            kind: "order_receipt",
            ...orderReceiptEmail({
              siteName,
              logoUrl,
              customerName: order.customer_name ?? "",
              orderNo: order.order_no,
              productName: order.product_name,
              quantity: Number(order.quantity ?? 1),
              total: Number(order.total ?? 0),
              paymentMethod: method,
              txid: String(order.txid ?? ""),
              trackUrl,
            }),
          })
        : Promise.resolve(),
      notifyEmail
        ? sendResendEmail({
            to: notifyEmail,
            kind: "admin_notify",
            ...adminNewOrderEmail({
              siteName,
              logoUrl,
              orderNo: order.order_no,
              productName: order.product_name,
              quantity: Number(order.quantity ?? 1),
              total: Number(order.total ?? 0),
              customerName: order.customer_name ?? "",
              customerEmail: order.customer_email ?? "",
              paymentMethod: method,
              txid: String(order.txid ?? ""),
              adminUrl: `${origin}/admin/orders`,
            }),
          })
        : Promise.resolve(),
    ]);
  } catch (e) {
    console.error("[eps] paid email side-effect failed:", e);
  }
}
