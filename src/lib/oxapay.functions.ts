import { createServerFn } from "@tanstack/react-start";
import { resolveSiteOrigin } from "@/lib/site-url";

/** Public: is OxaPay usable on the website checkout? (never returns the key) */
export const getOxapayStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { oxapaySettings } = await import("@/lib/oxapay-settle.server");
    const { oxapayEnabled } = await import("@/lib/oxapay.server");
    return { enabled: oxapayEnabled(await oxapaySettings()) };
  } catch (e) {
    console.error("[oxapay] status unavailable:", e);
    return { enabled: false };
  }
});

export const startOxapayCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: { product_id: string; quantity: number; customer_name: string; customer_email: string }) => {
    const qty = Math.max(1, Math.min(20, Math.floor(Number(d.quantity) || 1)));
    const email = String(d.customer_email ?? "").trim().slice(0, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Valid email is required");
    const name = String(d.customer_name ?? "").trim().slice(0, 80);
    if (name.length < 2) throw new Error("Name is required");
    const pid = String(d.product_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(pid)) throw new Error("Invalid product");
    return { product_id: pid, quantity: qty, customer_name: name, customer_email: email };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { oxapaySettings } = await import("@/lib/oxapay-settle.server");
    const { oxapayEnabled, oxapayKey, oxapayCreateInvoice } = await import("@/lib/oxapay.server");
    const db = supabaseAdmin as any;

    const settings = await oxapaySettings();
    if (!oxapayEnabled(settings)) throw new Error("Crypto (OxaPay) payments are not available right now.");

    const { data: product } = await db
      .from("products")
      .select("id,name,price,delivery_type,is_active,supplier_id,supplier_external_id,manual_stock_limited")
      .eq("id", data.product_id)
      .maybeSingle();
    if (!product || !product.is_active) throw new Error("Product is not available");

    if (product.supplier_id && product.supplier_external_id) {
      const { data: supplier } = await db.from("suppliers").select("*").eq("id", product.supplier_id).eq("is_enabled", true).maybeSingle();
      if (!supplier) throw new Error("Product is temporarily unavailable");
      let liveStock: number;
      try {
        const { supplierProducts } = await import("@/lib/suppliers/api.server");
        const catalogue = await supplierProducts(supplier as any);
        const live = catalogue.find((i) => String(i.external_id) === String(product.supplier_external_id));
        liveStock = Math.max(0, Number(live?.stock ?? 0));
      } catch (e) {
        console.error("[oxapay] live supplier stock check failed:", e);
        throw new Error("Live stock could not be verified. Please try again shortly.");
      }
      await db.from("products").update({ supplier_stock: liveStock }).eq("id", product.id);
      if (liveStock < data.quantity) throw new Error(liveStock > 0 ? `Only ${liveStock} item(s) are available` : "Product is out of stock");
    } else if (product.delivery_type === "auto" || product.manual_stock_limited) {
      const { data: c } = await db.rpc("stock_counts", { _product_ids: [product.id] });
      const left = Number((c ?? [])[0]?.available ?? 0);
      if (left < data.quantity) throw new Error(left > 0 ? `Only ${left} item(s) are available` : "Product is out of stock");
    }

    const unit = Number(product.price);
    const total = Math.round(unit * data.quantity * 100) / 100;
    if (!(total > 0)) throw new Error("Invalid order amount");

    const { data: order, error } = await db
      .from("orders")
      .insert({
        telegram_id: 0,
        source: "website",
        product_id: product.id,
        product_name: product.name,
        quantity: data.quantity,
        unit_price: unit,
        total,
        status: "pending",
        delivery_type: product.delivery_type,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        payment_method: "oxapay",
        meta: { gateway: "oxapay" },
      })
      .select("id,order_no")
      .maybeSingle();
    if (error || !order) throw new Error(error?.message ?? "Could not create the order");

    const origin = resolveSiteOrigin();
    const created = await oxapayCreateInvoice(oxapayKey(settings), {
      amountUsd: total,
      orderId: `W-${order.id}`,
      callbackUrl: `${origin}/api/public/oxapay/webhook`,
      returnUrl: `${origin}/api/public/oxapay/return?order=${order.order_no}`,
      email: data.customer_email,
      description: `Order #${order.order_no} · ${product.name}`,
    });
    if (!created.ok) {
      await db.from("orders").update({ status: "cancelled" }).eq("id", order.id);
      throw new Error(created.error);
    }
    await db
      .from("orders")
      .update({ txid: `OXA-${created.trackId}`, meta: { gateway: "oxapay", oxapay_track_id: created.trackId } })
      .eq("id", order.id);
    return { url: created.url, order_no: order.order_no as number };
  });
