import { createServerFn } from "@tanstack/react-start";
import { resolveSiteOrigin } from "@/lib/site-url";

/* Public storefront server functions — no auth required.
   Reads use the publishable key (anon RLS), writes are validated then
   performed with the admin client loaded inside the handler. */

function publicClient() {
  const key = process.env["SB_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
  const url = process.env["SB_URL"] ?? process.env["SUPABASE_URL"]!;
  return { url, key };
}

async function anonSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  const { url, key } = publicClient();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: any, init: any) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listStorefront = createServerFn({ method: "GET" }).handler(async () => {
  // Keep supplier catalogues fresh, but NEVER inside this request: the sync is
  // pinged as a separate worker invocation so a storefront visit can never hit
  // Cloudflare's per-request CPU limit (Error 1102).
  const { kickSupplierSync } = await import("@/lib/suppliers/kick.server");
  kickSupplierSync();

  const sb = await anonSupabase();
  const [cats, prods, hero] = await Promise.all([
    sb.from("categories").select("id,name,emoji,sort_order,channel").eq("is_active", true).order("sort_order"),
    sb
      .from("products")
      .select(
        "id,name,emoji,description,price,old_price,delivery_type,category_id,sort_order,featured_rank,image_url,delivery_time,badge,supplier_id,supplier_stock",
      )
      .eq("is_active", true)
      .is("owner_reseller_id", null)
      .order("sort_order"),
    sb.from("hero_items").select("id,name,image_url,accent,sort_order").eq("is_active", true).order("sort_order"),
  ]);
  const categories = (cats.data ?? []).filter((c: any) => c.channel !== "telegram");
  const allowed = new Set(categories.map((c: any) => c.id));
  const base = (prods.data ?? []).filter((p: any) => !p.category_id || allowed.has(p.category_id));

  const counts: Record<string, number> = {};
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: stock } = await supabaseAdmin
      .from("stock_items")
      .select("product_id")
      .eq("is_sold", false)
      .limit(5000);
    for (const s of stock ?? []) counts[s.product_id as string] = (counts[s.product_id as string] ?? 0) + 1;
  } catch (e) {
    console.error("[storefront] stock counts unavailable:", e);
  }


  const products = base.map((p: any) => ({
    ...p,
    stock: p.supplier_id ? Number(p.supplier_stock ?? 0) : (counts[p.id] ?? 0),
  }));
  return { categories, products, heroItems: hero.data ?? [] };
});

export const getStoreProduct = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const sb = await anonSupabase();
    const { data: row } = await sb
      .from("products")
      .select(
        "id,name,emoji,description,important_note,quick_guide,details,price,old_price,delivery_type,category_id,image_url,delivery_time,badge,supplier_id,supplier_stock",
      )
      .eq("id", data.id)
      .eq("is_active", true)
      .is("owner_reseller_id", null)
      .maybeSingle();
    if (!row) return null;
    let count = 0;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const res = await supabaseAdmin
        .from("stock_items")
        .select("id", { count: "exact", head: true })
        .eq("product_id", data.id)
        .eq("is_sold", false);
      count = res.count ?? 0;
    } catch (e) {
      console.error("[storefront] product stock unavailable:", e);
    }
    return { ...row, stock: (row as any).supplier_id ? Number((row as any).supplier_stock ?? 0) : count };
  });

export const getStorePayInfo = createServerFn({ method: "GET" }).handler(async () => {
  const map: Record<string, string> = {};
  const raw: Record<string, string> = {};
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("bot_settings")
      .select("key,value")
      .in("key", [
        // website-style keys
        "binance_pay_id",
        "usdt_bep20_address",
        "usdt_trc20_address",
        // the keys the Telegram bot admin panel actually saves
        "binance_pay",
        "usdt_bep20",
        "usdt_trc20",
        "bot_username",
        "support_contact",
      ]);
    for (const r of data ?? []) raw[r.key] = (r.value ?? "").trim();
  } catch (e) {
    console.error("[storefront] pay info unavailable:", e);
  }
  // Website + bot share one payment configuration: prefer the website key,
  // fall back to the bot panel key so resellers/users see the same address.
  map["binance_pay_id"] = raw["binance_pay_id"] || raw["binance_pay"] || "";
  map["usdt_bep20_address"] = raw["usdt_bep20_address"] || raw["usdt_bep20"] || "";
  map["usdt_trc20_address"] = raw["usdt_trc20_address"] || raw["usdt_trc20"] || "";
  map["bot_username"] = (raw["bot_username"] || "").replace(/^@/, "");
  map["support_contact"] = raw["support_contact"] || "";
  return map;
});



export const placeWebsiteOrder = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      product_id: string;
      quantity: number;
      customer_name: string;
      customer_email: string;
      payment_method: string;
      txid: string;
    }) => {
      const qty = Math.max(1, Math.min(20, Math.floor(Number(d.quantity) || 1)));
      const email = String(d.customer_email ?? "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Valid email is required");
      const name = String(d.customer_name ?? "").trim().slice(0, 80);
      if (name.length < 2) throw new Error("Name is required");
      const txid = String(d.txid ?? "").trim().slice(0, 200);
      if (txid.length < 4) throw new Error("Transaction ID / payment reference is required");
      const method = ["binance", "usdt_bep20", "usdt_trc20"].includes(d.payment_method) ? d.payment_method : "binance";
      return { product_id: String(d.product_id), quantity: qty, customer_name: name, customer_email: email, payment_method: method, txid };
    },
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id,name,price,delivery_type,is_active,supplier_id,supplier_external_id,supplier_stock")
      .eq("id", data.product_id)
      .maybeSingle();
    if (!product || !product.is_active) throw new Error("Product is not available");

    // Never accept a supplier order against a stale catalogue snapshot. Read
    // the supplier API immediately before submission and fail closed if its
    // current stock cannot be verified.
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
        console.error("[storefront] live supplier stock check failed:", error);
        throw new Error("Live stock could not be verified. Please try again shortly.");
      }
      await Promise.all([
        supabaseAdmin.from("products").update({ supplier_stock: liveStock }).eq("id", product.id),
        supabaseAdmin
          .from("supplier_products")
          .update({ stock: liveStock, last_synced_at: new Date().toISOString() })
          .eq("supplier_id", product.supplier_id)
          .eq("external_id", String(product.supplier_external_id)),
      ]);
      if (liveStock < data.quantity) throw new Error(liveStock > 0 ? `Only ${liveStock} item(s) are available` : "Product is out of stock");
    }

    const dup = await supabaseAdmin.from("orders").select("id").eq("txid", data.txid).maybeSingle();
    if (dup.data) throw new Error("This transaction ID has already been used");

    // Anti-spam: a buyer cannot pile up unverified orders while none are confirmed.
    const { count: openCount } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("source", "website")
      .eq("status", "pending")
      .ilike("customer_email", data.customer_email);
    if ((openCount ?? 0) >= 5)
      throw new Error("You already have several orders awaiting payment confirmation. Please wait until they are reviewed.");



    const unit = Number(product.price);
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        telegram_id: 0,
        source: "website",
        product_id: product.id,
        product_name: product.name,
        quantity: data.quantity,
        unit_price: unit,
        total: unit * data.quantity,
        status: "pending",
        delivery_type: product.delivery_type,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        payment_method: data.payment_method,
        txid: data.txid,
      })
      .select("order_no")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Best-effort service emails: order receipt to the buyer + a new-order
    // notification to the admin email stored in bot_settings. Email failures
    // never block order placement.
    try {
      const origin = resolveSiteOrigin();
      const orderNo = order?.order_no as number;
      const { data: cfgRows } = await supabaseAdmin
        .from("bot_settings")
        .select("key,value")
        .in("key", ["notify_email", "bot_name"]);
      const cfg: Record<string, string> = {};
      for (const r of cfgRows ?? []) cfg[r.key] = r.value ?? "";
      const siteName = cfg["bot_name"] || "Qorix Store";
      const notifyEmail = (cfg["notify_email"] || "").trim();

      const { sendResendEmail, getEmailBrand } = await import("@/lib/email/resend.server");
      const { logoUrl } = await getEmailBrand();
      const { orderReceiptEmail, adminNewOrderEmail } = await import("@/lib/email/templates");

      const total = unit * data.quantity;
      const trackUrl = `${origin}/track?order=${orderNo}&email=${encodeURIComponent(data.customer_email)}`;
      const adminUrl = `${origin}/admin/orders`;

      await Promise.allSettled([
        sendResendEmail({
          to: data.customer_email,
          kind: "order_receipt",
          ...orderReceiptEmail({
            siteName,
            logoUrl,
            customerName: data.customer_name,
            orderNo,
            productName: product.name,
            quantity: data.quantity,
            total,
            paymentMethod: data.payment_method,
            txid: data.txid,
            trackUrl,
          }),
        }),
        notifyEmail
          ? sendResendEmail({
              to: notifyEmail,
              kind: "admin_notify",
              ...adminNewOrderEmail({
                siteName,
                logoUrl,
                orderNo,
                productName: product.name,
                quantity: data.quantity,
                total,
                customerName: data.customer_name,
                customerEmail: data.customer_email,
                paymentMethod: data.payment_method,
                txid: data.txid,
                adminUrl,
              }),
            })
          : Promise.resolve(),
      ]);
    } catch (e) {
      console.error("[email] website order email side-effect failed:", e);
    }

    return { order_no: order?.order_no as number };
  });

export const trackWebsiteOrder = createServerFn({ method: "POST" })
  .inputValidator((d: { order_no: number | string; email: string }) => ({
    order_no: Number(d.order_no),
    email: String(d.email ?? "").trim().toLowerCase(),
  }))
  .handler(async ({ data }) => {
    if (!data.order_no || !data.email) throw new Error("Order number and email are required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("orders")
      .select("order_no,product_name,quantity,total,status,delivery_type,delivered_content,created_at,customer_email")
      .eq("order_no", data.order_no)
      .eq("source", "website")
      .maybeSingle();
    if (!row || String(row.customer_email ?? "").toLowerCase() !== data.email) throw new Error("Order not found");
    const { customer_email, ...safe } = row as any;
    return safe;
  });

/* ------------------------------------------------- editable site content */

export const getSiteContent = createServerFn({ method: "GET" }).handler(async () => {
  const map: Record<string, string> = {};
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("bot_settings").select("key,value").like("key", "site_%");
    if (error) throw error;
    for (const r of data ?? []) map[r.key as string] = (r.value as string) ?? "";
  } catch (e) {
    console.error("[storefront] site content via admin unavailable:", e);
  }
  // Fallback: public (anon) read of site_* rows, so logo/menu/footer never disappear
  // when the service-role key is missing on the host.
  if (Object.keys(map).length === 0) {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.from("bot_settings").select("key,value").like("key", "site_%");
      for (const r of data ?? []) map[(r as any).key as string] = ((r as any).value as string) ?? "";
    } catch (e) {
      console.error("[storefront] site content public read failed:", e);
    }
  }
  return map;
});



/* ------------------------------------------------- order confirmation page */

export const getOrderConfirmation = createServerFn({ method: "POST" })
  .inputValidator((d: { order_no: number | string; email: string }) => ({
    order_no: Number(d.order_no),
    email: String(d.email ?? "").trim().toLowerCase(),
  }))
  .handler(async ({ data }) => {
    if (!data.order_no || !data.email) throw new Error("Order number and email are required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("orders")
      .select(
        "order_no,product_name,quantity,unit_price,total,discount,status,delivery_type,delivered_content,payment_method,txid,created_at,customer_name,customer_email",
      )
      .eq("order_no", data.order_no)
      .eq("source", "website")
      .maybeSingle();
    if (!row || String((row as any).customer_email ?? "").toLowerCase() !== data.email) throw new Error("Order not found");

    // Wallet snapshot for the buyer account (if one exists for this email).
    let wallet: { balance: number; earnings: number; recent: any[] } | null = null;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,wallet_balance,referral_earnings")
      .ilike("email", data.email)
      .maybeSingle();
    if (profile) {
      const { data: txs } = await supabaseAdmin
        .from("wallet_transactions")
        .select("id,type,amount,balance_after,note,created_at")
        .eq("user_id", (profile as any).id)
        .order("created_at", { ascending: false })
        .limit(5);
      wallet = {
        balance: Number((profile as any).wallet_balance ?? 0),
        earnings: Number((profile as any).referral_earnings ?? 0),
        recent: txs ?? [],
      };
    }

    const { customer_email, ...safe } = row as any;
    return { order: safe, wallet };
  });
