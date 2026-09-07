// Server-only core for the public Reseller API (website + bot channels).
// Handles API-key auth, catalogue projection, balance debit and auto delivery.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

export type Reseller = {
  id: string;
  name: string;
  balance: number;
  discount_percent: number;
  is_active: boolean;
  allow_website: boolean;
  allow_bot: boolean;
};

export type Channel = "website" | "bot" | "all";

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-api-key, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

export function preflight() {
  return json({ ok: true });
}

export function readApiKey(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  return bearer || (request.headers.get("x-api-key") ?? "").trim();
}

/** Resolve the API key to an active reseller, or return a Response to send back. */
export async function authReseller(
  request: Request,
  channel: Channel = "all",
): Promise<{ reseller: Reseller } | { error: Response }> {
  const key = readApiKey(request);
  if (!key) return { error: fail("Missing API key. Send `Authorization: Bearer <key>`.", 401) };

  const { data } = await db.from("resellers").select("*").eq("api_key", key).maybeSingle();
  if (!data) return { error: fail("Invalid API key", 401) };
  if (!data.is_active) return { error: fail("This reseller account is disabled", 403) };
  if (channel === "website" && !data.allow_website) return { error: fail("Website API access is disabled for this account", 403) };
  if (channel === "bot" && !data.allow_bot) return { error: fail("Bot API access is disabled for this account", 403) };

  void db.from("resellers").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { reseller: data as Reseller };
}

export function resellerPrice(price: number, discountPercent: number) {
  const p = Number(price) * (1 - Number(discountPercent || 0) / 100);
  return Math.max(0, Math.round(p * 100) / 100);
}

function channelFilter(channel: Channel) {
  // categories.channel is 'both' | 'website' | 'telegram'
  if (channel === "website") return (c: any) => c.channel !== "telegram";
  if (channel === "bot") return (c: any) => c.channel !== "website";
  return () => true;
}

/** Full catalogue a reseller may resell, with their price and live stock. */
export async function catalogue(reseller: Reseller, channel: Channel) {
  const [{ data: cats }, { data: prods }] = await Promise.all([
    db.from("categories").select("id,name,emoji,sort_order,channel").eq("is_active", true).order("sort_order"),
    db
      .from("products")
      .select(
        "id,name,emoji,description,important_note,quick_guide,price,old_price,delivery_type,category_id,sort_order,image_url,delivery_time,badge,featured_rank,supplier_id,supplier_stock,owner_reseller_id",
      )
      .eq("is_active", true)
      .or(`owner_reseller_id.is.null,owner_reseller_id.eq.${reseller.id}`)
      .order("sort_order"),
  ]);

  const categories = (cats ?? []).filter(channelFilter(channel));
  const allowed = new Set(categories.map((c: any) => c.id));

  const { data: stock } = await db.from("stock_items").select("product_id").eq("is_sold", false);
  const counts: Record<string, number> = {};
  for (const s of stock ?? []) counts[s.product_id as string] = (counts[s.product_id as string] ?? 0) + 1;

  const catName: Record<string, string> = {};
  for (const c of categories) catName[c.id] = c.name;

  const products = (prods ?? [])
    .filter((p: any) => !p.category_id || allowed.has(p.category_id))
    .map((p: any) => publicProduct(p, reseller, counts, catName));

  return {
    categories: categories.map((c: any) => ({ id: c.id, name: c.name, emoji: c.emoji, sort_order: c.sort_order })),
    products,
  };
}

export function publicProduct(
  p: any,
  reseller: Reseller,
  counts: Record<string, number>,
  catName: Record<string, string> = {},
) {
  const stock = p.supplier_id ? Number(p.supplier_stock ?? 0) : (counts[p.id] ?? 0);
  // A reseller's own uploaded product costs them nothing at Qorix — they own the stock.
  const own = Boolean(p.owner_reseller_id) && p.owner_reseller_id === reseller.id;
  return {
    own,
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    description: p.description,
    important_note: p.important_note ?? null,
    quick_guide: p.quick_guide ?? null,
    image_url: p.image_url ?? null,
    delivery_time: p.delivery_time ?? null,
    badge: p.badge ?? null,
    category_id: p.category_id,
    category_name: p.category_id ? (catName[p.category_id] ?? null) : null,
    retail_price: Number(p.price),
    price: own ? 0 : resellerPrice(Number(p.price), reseller.discount_percent),
    old_price: p.old_price != null ? Number(p.old_price) : null,
    currency: "USD",
    delivery_type: p.delivery_type,
    instant: p.delivery_type === "auto" || Boolean(p.supplier_id),
    stock,
    in_stock: stock > 0 || p.delivery_type !== "auto",
    featured_rank: Number(p.featured_rank ?? 0),
    sort_order: Number(p.sort_order ?? 0),
  };
}

export async function singleProduct(reseller: Reseller, id: string) {
  const { data: p } = await db
    .from("products")
    .select(
      "id,name,emoji,description,important_note,quick_guide,price,old_price,delivery_type,category_id,sort_order,image_url,delivery_time,badge,featured_rank,supplier_id,supplier_stock,owner_reseller_id",
    )
    .eq("id", id)
    .eq("is_active", true)
    .or(`owner_reseller_id.is.null,owner_reseller_id.eq.${reseller.id}`)
    .maybeSingle();
  if (!p) return null;
  const { count } = await db
    .from("stock_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id)
    .eq("is_sold", false);
  const cat = p.category_id
    ? (await db.from("categories").select("name").eq("id", p.category_id).maybeSingle()).data
    : null;
  return publicProduct(p, reseller, { [id]: count ?? 0 }, cat ? { [p.category_id]: cat.name } : {});
}

export function orderPayload(o: any) {
  return {
    id: o.id,
    order_no: o.order_no,
    external_ref: o.external_ref ?? null,
    product_id: o.product_id,
    product_name: o.product_name,
    quantity: o.quantity,
    unit_price: Number(o.unit_price),
    total: Number(o.total),
    status: o.status,
    delivery_type: o.delivery_type,
    items: o.delivered_content ? String(o.delivered_content).split("\n---\n") : [],
    customer_name: o.customer_name ?? null,
    customer_email: o.customer_email ?? null,
    created_at: o.created_at,
  };
}

/** Buy a product on behalf of a reseller: debit wallet, fulfil, refund on failure. */
export async function purchase(
  reseller: Reseller,
  input: { product_id: string; quantity: number; external_ref?: string | null; customer_name?: string | null; customer_email?: string | null; channel: Channel },
) {
  const qty = Math.max(1, Math.min(50, Math.floor(Number(input.quantity) || 1)));

  if (input.external_ref) {
    const { data: dup } = await db
      .from("orders")
      .select("*")
      .eq("reseller_id", reseller.id)
      .eq("external_ref", input.external_ref)
      .maybeSingle();
    if (dup) return { ok: true as const, duplicate: true, order: orderPayload(dup) };
  }

  const { data: p } = await db
    .from("products")
    .select("id,name,price,delivery_type,is_active,supplier_id,supplier_external_id,supplier_stock,owner_reseller_id")
    .eq("id", input.product_id)
    .maybeSingle();
  if (!p || !p.is_active) return { ok: false as const, status: 404, error: "Product not found" };
  if (p.owner_reseller_id && p.owner_reseller_id !== reseller.id)
    return { ok: false as const, status: 404, error: "Product not found" };

  const ownProduct = p.owner_reseller_id === reseller.id;
  const unit = ownProduct ? 0 : resellerPrice(Number(p.price), reseller.discount_percent);
  const total = Math.round(unit * qty * 100) / 100;
  if (Number(reseller.balance) + 1e-9 < total)
    return { ok: false as const, status: 402, error: "Insufficient balance", balance: Number(reseller.balance), required: total };

  // 1) Reserve the order row first. A unique index on (reseller_id, external_ref)
  //    makes duplicate/replayed API calls impossible, even when they race.
  const ref = input.external_ref ?? `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: reserved, error: reserveError } = await db
    .from("orders")
    .insert({
      telegram_id: 0,
      source: input.channel === "bot" ? "api_bot" : "api_website",
      reseller_id: reseller.id,
      external_ref: input.external_ref ?? null,
      product_id: p.id,
      product_name: p.name,
      quantity: qty,
      unit_price: unit,
      total,
      // orders.status only allows pending | completed | cancelled — reserve as pending.
      status: "pending",
      delivery_type: p.delivery_type,
      customer_name: input.customer_name ?? reseller.name,
      customer_email: input.customer_email ?? null,
      payment_method: "reseller_balance",
    })
    .select("*")
    .maybeSingle();

  if (reserveError || !reserved) {
    if (input.external_ref) {
      const { data: dup2 } = await db
        .from("orders")
        .select("*")
        .eq("reseller_id", reseller.id)
        .eq("external_ref", input.external_ref)
        .maybeSingle();
      if (dup2) return { ok: true as const, duplicate: true, order: orderPayload(dup2) };
    }
    return { ok: false as const, status: 500, error: "Order could not be recorded" };
  }

  // 2) Debit the wallet atomically (the DB rejects a negative balance).
  const { data: balanceAfter, error: debitError } = await db.rpc("reseller_adjust_balance", {
    _reseller_id: reseller.id,
    _amount: -total,
    _type: "order",
    _reference: ref,
    _note: `${qty}× ${p.name}`,
  });
  if (debitError) {
    await db.from("orders").delete().eq("id", reserved.id);
    return { ok: false as const, status: 402, error: debitError.message ?? "Insufficient balance" };
  }

  // Warn the reseller in Telegram when this order pushed them under their limit.
  void (async () => {
    try {
      const { checkResellerLowBalance } = await import("@/lib/bot/engine.server");
      await checkResellerLowBalance(reseller.id);
    } catch {
      /* alerting must never break an order */
    }
  })();

  let delivered: string | null = null;
  let status = "pending";
  let failReason: string | null = null;

  try {
    if (p.supplier_id && p.supplier_external_id) {
      const { data: sup } = await db.from("suppliers").select("*").eq("id", p.supplier_id).maybeSingle();
      if (!sup) failReason = "Supplier record not found";
      else if (!sup.is_enabled) failReason = "Supplier is temporarily unavailable";
      else {
        const { supplierOrder } = await import("@/lib/suppliers/api.server");
        const { supplierPreflight } = await import("@/lib/suppliers/fulfil.server");
        // Advisory only — supplier balance endpoints can report 0 for funded
        // wallets, so let the supplier API itself accept or reject the order.
        await supplierPreflight(sup, Number(p.price) * qty);
        const res = await supplierOrder(sup as any, String(p.supplier_external_id), qty, `qorix-api-${reserved.id}`, {
          customerEmail: input.customer_email ?? null,
        });
        if (res.items.length) {
          delivered = res.items.join("\n---\n");
          status = "completed";
        } else failReason = "Supplier returned no items";

      }
    } else if (p.delivery_type === "auto") {
      // Atomic claim so two API calls can never be sold the same item.
      const { data: items } = await db.rpc("claim_stock_items", { _product_id: p.id, _qty: qty, _sold_to: null });
      const claimed = (items ?? []) as any[];
      if (claimed.length >= qty) {
        delivered = claimed.map((i: any) => String(i.content)).join("\n---\n");
        status = "completed";
      } else {
        if (claimed.length)
          await db
            .from("stock_items")
            .update({ is_sold: false, sold_to: null, sold_at: null })
            .in("id", claimed.map((i: any) => i.id));
        failReason = "Out of stock";
      }
    }
  } catch (e) {
    failReason = e instanceof Error ? e.message : "Fulfilment failed";
  }

  // 3) Nothing delivered on an instant product → refund and void the order.
  if (status !== "completed" && p.delivery_type === "auto") {
    await db.rpc("reseller_adjust_balance", {
      _reseller_id: reseller.id,
      _amount: total,
      _type: "refund",
      _reference: ref,
      _note: `Refund: ${failReason ?? "delivery failed"}`,
    });
    await db.from("orders").delete().eq("id", reserved.id);
    return { ok: false as const, status: 409, error: failReason ?? "Delivery failed", refunded: true };
  }

  const { data: order } = await db
    .from("orders")
    .update({ status, delivered_content: delivered })
    .eq("id", reserved.id)
    .select("*")
    .maybeSingle();

  return {
    ok: true as const,
    order: orderPayload(order ?? { ...reserved, status, delivered_content: delivered }),
    balance: Number(balanceAfter ?? reseller.balance - total),
  };
}

