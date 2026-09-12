import { createServerFn } from "@tanstack/react-start";
import { resolveSiteOrigin } from "@/lib/site-url";

/* Public EPS (Easy Payment System) checkout — bKash, Nagad, Rocket, Visa,
   Mastercard and bank, all on the EPS hosted page. No auth required: the buyer
   is a guest, and the payment itself is verified server-side on return. */

/** Is the local gateway usable, and at what BDT rate? Shown on /checkout. */
export const getEpsStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { epsSettings } = await import("@/lib/eps-settle.server");
    const { epsConfig, EPS_CHANNELS } = await import("@/lib/eps.server");
    const cfg = epsConfig(await epsSettings());
    return { enabled: cfg.enabled, rate: cfg.rate, channels: EPS_CHANNELS };
  } catch (e) {
    console.error("[eps] status unavailable:", e);
    return { enabled: false, rate: 0, channels: [] as string[] };
  }
});

export const startEpsCheckout = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      product_id: string;
      quantity: number;
      customer_name: string;
      customer_email: string;
      customer_phone: string;
    }) => {
      const qty = Math.max(1, Math.min(20, Math.floor(Number(d.quantity) || 1)));
      const email = String(d.customer_email ?? "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Valid email is required");
      const name = String(d.customer_name ?? "").trim().slice(0, 80);
      if (name.length < 2) throw new Error("Name is required");
      const phone = String(d.customer_phone ?? "").replace(/[^\d+]/g, "").slice(0, 20);
      if (phone.replace(/\D/g, "").length < 11) throw new Error("A valid Bangladeshi mobile number is required");
      return { product_id: String(d.product_id), quantity: qty, customer_name: name, customer_email: email, customer_phone: phone };
    },
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { epsSettings } = await import("@/lib/eps-settle.server");
    const { epsConfig, initializePayment, newMerchantTransactionId, usdToBdt } = await import("@/lib/eps.server");

    const settings = await epsSettings();
    const cfg = epsConfig(settings);
    if (!cfg.enabled) throw new Error("Card & mobile banking payments are not available right now.");

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id,name,price,delivery_type,is_active,supplier_id,supplier_external_id,supplier_stock")
      .eq("id", data.product_id)
      .maybeSingle();
    if (!product || !product.is_active) throw new Error("Product is not available");

    // Never sell a supplier item against a stale snapshot.
    if (product.supplier_id && product.supplier_external_id) {
      const { data: supplier } = await supabaseAdmin
        .from("suppliers")
        .select("*")
        .eq("id", product.supplier_id)
        .eq("is_enabled", true)
        .maybeSingle();
      if (!supplier) throw new Error("Supplier is temporarily unavailable");
      let liveStock: number;
      try {
        const { supplierProducts } = await import("@/lib/suppliers/api.server");
        const catalogue = await supplierProducts(supplier as any);
        const live = catalogue.find((item) => String(item.external_id) === String(product.supplier_external_id));
        liveStock = Math.max(0, Number(live?.stock ?? 0));
      } catch (error) {
        console.error("[eps] live supplier stock check failed:", error);
        throw new Error("Live stock could not be verified. Please try again shortly.");
      }
      await supabaseAdmin.from("products").update({ supplier_stock: liveStock }).eq("id", product.id);
      if (liveStock < data.quantity)
        throw new Error(liveStock > 0 ? `Only ${liveStock} item(s) are available` : "Product is out of stock");
    }

    const unit = Number(product.price);
    const totalUsd = Math.round(unit * data.quantity * 100) / 100;
    const amountBdt = usdToBdt(totalUsd, cfg.rate);
    if (!(amountBdt > 0)) throw new Error("Invalid order amount");

    const mtid = newMerchantTransactionId();

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        telegram_id: 0,
        source: "website",
        product_id: product.id,
        product_name: product.name,
        quantity: data.quantity,
        unit_price: unit,
        total: totalUsd,
        status: "pending",
        delivery_type: product.delivery_type,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        payment_method: "eps",
        txid: `EPS-${mtid}`,
        meta: { gateway: "eps", bdt: amountBdt, rate: cfg.rate, phone: data.customer_phone },
      } as any)
      .select("id,order_no")
      .maybeSingle();
    if (error || !order) throw new Error(error?.message ?? "Could not create the order");

    const origin = resolveSiteOrigin();
    const ret = (extra = "") => `${origin}/api/public/eps/return?mtid=${mtid}${extra}`;
    const created = await initializePayment(cfg, {
      merchantTransactionId: mtid,
      customerOrderId: String(order.order_no),
      amountBdt,
      successUrl: ret(),
      failUrl: ret("&state=fail"),
      cancelUrl: ret("&state=cancel"),
      customerName: data.customer_name,
      customerEmail: data.customer_email,
      customerPhone: data.customer_phone,
      productName: product.name,
      noOfItem: data.quantity,
      productCategory: "Digital goods",
    });

    if (!created.ok) {
      await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
      throw new Error(created.error);
    }

    await supabaseAdmin
      .from("orders")
      .update({ meta: { gateway: "eps", bdt: amountBdt, rate: cfg.rate, phone: data.customer_phone, eps_init_id: created.transactionId } } as any)
      .eq("id", order.id);

    return { url: created.url, order_no: order.order_no as number, amount_bdt: amountBdt };
  });
