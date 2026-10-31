import { likeExact } from "@/lib/ilike-escape";
import { createServerFn } from "@tanstack/react-start";
import { resolveSiteOrigin } from "@/lib/site-url";
import { bybitTxidSchema } from "@/lib/bybit-payment";

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
  const { publicProducts } = await import("@/lib/public-products.server");
  const [cats, prods, hero] = await Promise.all([
    sb
      .from("categories")
      .select("id,name,emoji,image_url,sort_order,channel")
      .eq("is_active", true)
      .order("sort_order"),
    publicProducts()
      .select(
        "id,name,emoji,description,price,old_price,delivery_type,category_id,sort_order,featured_rank,image_url,delivery_time,badge,stock,instant,is_active",
      )
      .eq("is_active", true)
      .order("sort_order"),
    sb.from("hero_items").select("id,name,image_url,accent,sort_order").eq("is_active", true).order("sort_order"),
  ]);
  const categories = (cats.data ?? []).filter((c: any) => c.channel !== "telegram");
  const allowed = new Set(categories.map((c: any) => c.id));
  // Extra category links (a product can be assigned to several categories).
  const { data: links } = await sb.from("product_categories").select("product_id,category_id");
  const linkMap: Record<string, string[]> = {};
  for (const l of links ?? []) (linkMap[l.product_id as string] ??= []).push(l.category_id as string);
  const { guardVisibleProducts } = await import("@/lib/suppliers/visibility-guard.server");
  const base = guardVisibleProducts((prods.data ?? []).map((p) => ({
    ...p, id: String(p.id ?? ""), name: String(p.name ?? ""), is_active: p.is_active === true,
  })), "web")
    .map((p: any) => ({
      ...p,
      category_ids: Array.from(new Set([...(linkMap[p.id] ?? []), ...(p.category_id ? [p.category_id] : [])])),
    }))
    .filter((p: any) => p.category_ids.length === 0 || p.category_ids.some((id: string) => allowed.has(id)));

  const products = base
    // Same serial as the Telegram bot: admin-pinned (featured_rank 1,2,3…)
    // first in that exact order, then the normal sort_order.
    .sort((a: any, b: any) => {
      const ra = Number(a.featured_rank ?? 0) || Number.MAX_SAFE_INTEGER;
      const rb = Number(b.featured_rank ?? 0) || Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    });
  return { categories, products, heroItems: hero.data ?? [] };
});

export const getStoreProduct = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { publicProducts } = await import("@/lib/public-products.server");
    const { data: row } = await publicProducts()
      .select(
        "id,name,emoji,description,important_note,quick_guide,details,price,old_price,delivery_type,category_id,image_url,delivery_time,badge,stock,instant,manual_stock_limited",
      )
      .eq("id", data.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!row) return null;
    let stock = Number(row.stock ?? 0);
    if (row.instant) {
      try {
        const { refreshLiveStock } = await import("@/lib/suppliers/live-stock.server");
        const live = await refreshLiveStock(String((row as any).id));
        if (live) stock = live.stock;
      } catch (e) {
        console.error("[storefront] live stock unavailable:", e);
      }
    }
    return { ...row, id: String(row.id ?? ""), name: String(row.name ?? ""), stock };
  });

/**
 * Lightweight product fields for SSR head metadata / structured data.
 * Intentionally does NOT touch supplier live-stock (kept cheap for crawlers).
 */
export const getProductSeo = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { publicProducts } = await import("@/lib/public-products.server");
    const { data: row } = await publicProducts()
      .select("id,name,description,price,image_url,delivery_type,stock,instant,manual_stock_limited")
      .eq("id", data.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!row) return null;
    const anyRow = row as any;
    return {
      id: String(anyRow.id),
      name: String(anyRow.name ?? ""),
      description: String(anyRow.description ?? ""),
      price: Number(anyRow.price ?? 0),
      image_url: (anyRow.image_url ?? null) as string | null,
      in_stock: Number(anyRow.stock ?? 0) > 0 || (!anyRow.instant && !anyRow.manual_stock_limited),
    };
  });



function binanceSwitches(raw: Record<string, string | null | undefined>) {
  const on = (k: string) => {
    const v = (raw[k] ?? "").trim();
    return v === "" || v === "1" || v === "true";
  };
  const active = (raw["binance_status"] ?? "active") !== "inactive";
  return { payid: active && on("binance_enable_payid"), crypto: active && on("binance_enable_crypto") };
}

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
        "binance_status",
        "binance_enable_payid",
        "binance_enable_crypto",
      ]);
    for (const r of data ?? []) raw[r.key] = (r.value ?? "").trim();
  } catch (e) {
    console.error("[storefront] pay info unavailable:", e);
  }
  const sw = binanceSwitches(raw);
  // Website + bot share one payment configuration: prefer the website key,
  // fall back to the bot panel key so resellers/users see the same address.
  // A method switched off in Admin → Binance Setup is hidden (blank).
  map["binance_pay_id"] = sw.payid ? raw["binance_pay_id"] || raw["binance_pay"] || "" : "";
  map["usdt_bep20_address"] = sw.crypto ? raw["usdt_bep20_address"] || raw["usdt_bep20"] || "" : "";
  map["usdt_trc20_address"] = sw.crypto ? raw["usdt_trc20_address"] || raw["usdt_trc20"] || "" : "";
  map["enable_payid"] = sw.payid ? "1" : "0";
  map["enable_crypto"] = sw.crypto ? "1" : "0";
  map["bot_username"] = (raw["bot_username"] || "").replace(/^@/, "");
  map["support_contact"] = raw["support_contact"] || "";
  try {
    const { bybitSettings } = await import("@/lib/bybit.server");
    const { bybitEnabled } = await import("@/lib/bybit-payment");
    const settings = await bybitSettings();
    map["bybit_uid"] = bybitEnabled(settings) ? settings["bybit_uid"] ?? "" : "";
  } catch { map["bybit_uid"] = ""; }
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
      const method = ["binance", "bybit", "usdt_bep20", "usdt_trc20"].includes(d.payment_method) ? d.payment_method : "binance";
      if (method === "bybit") {
        bybitTxidSchema.parse(txid);
      }
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
    {
      const { data: rows } = await supabaseAdmin
        .from("bot_settings")
        .select("key,value")
        .in("key", ["binance_status", "binance_enable_payid", "binance_enable_crypto"]);
      const raw: Record<string, string> = {};
      for (const r of rows ?? []) raw[r.key] = r.value ?? "";
      const sw = binanceSwitches(raw);
      let allowed = data.payment_method === "binance" ? sw.payid : sw.crypto;
      if (data.payment_method === "bybit") {
        const { bybitSettings } = await import("@/lib/bybit.server");
        const { bybitEnabled } = await import("@/lib/bybit-payment");
        allowed = bybitEnabled(await bybitSettings());
      }
      if (!allowed) throw new Error("This payment method is currently unavailable");
    }

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
      if (!supplier) throw new Error("Product is temporarily unavailable");
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

    let duplicateQuery = supabaseAdmin.from("orders").select("id").eq("txid", data.txid);
    duplicateQuery = data.payment_method === "bybit" ? duplicateQuery.eq("payment_method", "bybit") : duplicateQuery.neq("payment_method", "bybit");
    const dup = await duplicateQuery.maybeSingle();
    if (dup.data) throw new Error("This transaction ID has already been used");

    // Anti-spam: a buyer cannot pile up unverified orders while none are confirmed.
    const { count: openCount } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("source", "website")
      .eq("status", "pending")
      .ilike("customer_email", likeExact(data.customer_email));
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
      .select("id,order_no")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Check the typed ID against real Binance history right away; the admin
    // panel shows the result (found / not found) before anyone delivers.
    if (order?.id) {
      try {
        if (data.payment_method === "bybit") {
          const { verifyBybitWebsiteOrder } = await import("@/lib/bybit-settle.server");
          await verifyBybitWebsiteOrder(String(order.id));
        } else {
          const { verifyWebsiteOrderTxid } = await import("@/lib/website-binance-verify.server");
          await verifyWebsiteOrderTxid(String(order.id));
        }
      } catch (e) {
        console.error("[storefront] Binance TXID check failed:", e);
      }
    }

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
      const { orderAccessToken } = await import("@/lib/order-access.server");
      const trackUrl = `${origin}/track?order=${orderNo}&email=${encodeURIComponent(data.customer_email)}&t=${orderAccessToken(orderNo, data.customer_email)}`;
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

    const { orderAccessToken } = await import("@/lib/order-access.server");
    return {
      order_no: order?.order_no as number,
      token: orderAccessToken(order?.order_no as number, data.customer_email),
    };
  });

export const trackWebsiteOrder = createServerFn({ method: "POST" })
  .inputValidator((d: { order_no: number | string; email: string; token?: string }) => ({
    order_no: Number(d.order_no),
    email: String(d.email ?? "").trim().toLowerCase().slice(0, 160),
    token: String(d.token ?? "").slice(0, 64),
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
    const { verifyOrderAccessToken, callerEmail } = await import("@/lib/order-access.server");
    const owner = verifyOrderAccessToken(data.order_no, data.email, data.token) || (await callerEmail()) === data.email;
    const { customer_email, delivered_content, ...safe } = row as any;
    return { ...safe, delivered_content: owner ? delivered_content : null, locked: !owner && Boolean(delivered_content) };
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
  .inputValidator((d: { order_no: number | string; email: string; token?: string }) => ({
    order_no: Number(d.order_no),
    email: String(d.email ?? "").trim().toLowerCase().slice(0, 160),
    token: String(d.token ?? "").slice(0, 64),
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
    const { verifyOrderAccessToken, callerEmail } = await import("@/lib/order-access.server");
    const signedInAs = await callerEmail();
    const owner = verifyOrderAccessToken(data.order_no, data.email, data.token) || signedInAs === data.email;
    if (!owner) throw new Error("Order not found");

    // Wallet snapshot for the buyer account (if one exists for this email).
    let wallet: { balance: number; earnings: number; recent: any[] } | null = null;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,wallet_balance,referral_earnings")
      .ilike("email", likeExact(data.email))
      .maybeSingle();
    if (profile && signedInAs === data.email) {
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
