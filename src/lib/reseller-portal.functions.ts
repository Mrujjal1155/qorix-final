import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Random reseller API key (same format the admin panel generates). */
function newKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "qxr_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function emailOf(context: any, db: any): Promise<string> {
  const fromClaims = String(context.claims?.email ?? "").toLowerCase();
  if (fromClaims) return fromClaims;
  const { data } = await db.auth.admin.getUserById(context.userId);
  return String(data?.user?.email ?? "").toLowerCase();
}

/**
 * Resolve (and if needed auto-link) the reseller account for the signed-in user.
 * A user becomes a reseller when their email matches an approved application
 * or an existing reseller record.
 */
async function resolveReseller(context: any) {
  const db = await adminDb();
  const userId = context.userId as string;

  const { data: linked } = await db.from("resellers").select("*").eq("user_id", userId).maybeSingle();
  if (linked) return { db, reseller: linked, email: linked.email ?? "" };

  const email = await emailOf(context, db);
  if (!email) return { db, reseller: null, email: "", status: "none" as const };

  // 1) an existing reseller row with the same email (never create a second one)
  const { data: emailRows } = await db
    .from("resellers")
    .select("*")
    .ilike("email", email)
    .order("created_at", { ascending: true });
  const rows: any[] = emailRows ?? [];
  const byEmail = rows.find((r) => !r.user_id);
  if (byEmail) {
    await db.from("resellers").update({ user_id: userId }).eq("id", byEmail.id);
    return { db, reseller: { ...byEmail, user_id: userId }, email };
  }
  if (rows.length) {
    // Already owned by another login — do NOT create a duplicate account.
    return { db, reseller: null, email, status: "none" as const };
  }

  // 2) an approved application with the same email -> create the reseller row
  const { data: approvedApps } = await db
    .from("reseller_applications")
    .select("*")
    .eq("email", email)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1);
  const app = approvedApps?.[0];

  if (app) {
    const { data: created } = await db
      .from("resellers")
      .insert({
        name: app.name || email,
        email,
        api_key: newKey(),
        user_id: userId,
        allow_website: app.channel !== "bot",
        allow_bot: app.channel !== "website",
      })
      .select("*")
      .maybeSingle();
    if (created) {
      await db.from("reseller_applications").update({ reseller_id: created.id }).eq("id", app.id);
      return { db, reseller: created, email };
    }
  }

  const { data: pendingRows } = await db
    .from("reseller_applications")
    .select("status")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1);
  const pending = pendingRows?.[0];

  return { db, reseller: null, email, status: (pending?.status ?? "none") as "pending" | "rejected" | "none" };
}

export type PanelMonth = {
  month: string;
  orders: number;
  cost: number;
  sale: number;
  margin: number;
  marginPercent: number;
  avgFulfilMinutes: number | null;
};

export type MyProduct = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price: number;
  delivery_type: string;
  delivery_time: string;
  is_active: boolean;
  stock: number;
  sold: number;
};

/** Products this reseller uploaded themselves, with live stock counts. */
async function loadMyProducts(db: any, resellerId: string): Promise<MyProduct[]> {
  const { data: rows } = await db
    .from("products")
    .select("id,name,emoji,description,price,delivery_type,delivery_time,is_active")
    .eq("owner_reseller_id", resellerId)
    .order("created_at", { ascending: false });
  const ids = (rows ?? []).map((r: any) => r.id);
  const counts: Record<string, { stock: number; sold: number }> = {};
  if (ids.length) {
    const { data: stock } = await db.from("stock_items").select("product_id,is_sold").in("product_id", ids);
    for (const s of stock ?? []) {
      const c = (counts[s.product_id] ??= { stock: 0, sold: 0 });
      if (s.is_sold) c.sold += 1;
      else c.stock += 1;
    }
  }
  return (rows ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji ?? "📦",
    description: r.description ?? "",
    price: Number(r.price ?? 0),
    delivery_type: r.delivery_type ?? "auto",
    delivery_time: r.delivery_time ?? "",
    is_active: Boolean(r.is_active),
    stock: counts[r.id]?.stock ?? 0,
    sold: counts[r.id]?.sold ?? 0,
  }));
}

export type PanelState =
  | { linked: false; status: "pending" | "rejected" | "none"; email: string }
  | {
      linked: true;
      email: string;
      reseller: {
        id: string;
        name: string;
        api_key: string;
        balance: number;
        discount_percent: number;
        is_active: boolean;
        allow_website: boolean;
        allow_bot: boolean;
        created_at: string;
        site_url: string;
        site_name: string;
        bot_username: string;
        support_contact: string;
        markup_percent: number;
        webhook_url: string;
        webhook_secret: string;
        webhook_last_status: string;
        webhook_last_at: string | null;
      };
      stats: {
        orders: number;
        spent: number;
        retail: number;
        profit: number;
        completed: number;
        pending: number;
        siteBill: number;
        siteRetail: number;
        siteOrders: number;
        pendingBill: number;
        balance: number;
        website: { orders: number; spent: number; profit: number };
        bot: { orders: number; spent: number; profit: number };
        other: { orders: number; spent: number; profit: number };
        daily: { date: string; orders: number; spent: number; profit: number }[];
        monthly: {
          month: string;
          orders: number;
          cost: number;
          sale: number;
          margin: number;
          marginPercent: number;
          avgFulfilMinutes: number | null;
        }[];
        avgFulfilMinutes: number | null;
      };

      myProducts: MyProduct[];

      orders: any[];
      transactions: any[];
      topups: any[];
    };

/** Everything the reseller dashboard needs in one call. */
export const getResellerPanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PanelState> => {
    const { db, reseller, email, status } = await resolveReseller(context as any);
    if (!reseller) return { linked: false, status: status ?? "none", email };

    const [{ data: orders }, { data: transactions }, { data: topups }, { data: products }] = await Promise.all([
      db
        .from("orders")
        .select("id,order_no,product_id,product_name,quantity,unit_price,total,status,source,external_ref,created_at,updated_at,delivered_content")
        .eq("reseller_id", reseller.id)
        .order("created_at", { ascending: false })
        .limit(300),
      db
        .from("reseller_transactions")
        .select("*")
        .eq("reseller_id", reseller.id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("reseller_topups")
        .select("*")
        .eq("reseller_id", reseller.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db.from("products").select("id,price"),
    ]);

    const retailOf = new Map<string, number>((products ?? []).map((p: any) => [p.id, Number(p.price ?? 0)]));
    const empty = () => ({ orders: 0, spent: 0, profit: 0 });
    const stats = {
      orders: 0,
      spent: 0,
      retail: 0,
      profit: 0,
      completed: 0,
      pending: 0,
      siteBill: 0,
      siteRetail: 0,
      siteOrders: 0,
      pendingBill: 0,
      balance: Number(reseller.balance ?? 0),
      website: empty(),
      bot: empty(),
      other: empty(),
      daily: [] as { date: string; orders: number; spent: number; profit: number }[],
      monthly: [] as PanelMonth[],
      avgFulfilMinutes: null as number | null,
    };

    const markupRate = 1 + Number(reseller.markup_percent ?? 25) / 100;
    const byMonth = new Map<string, PanelMonth & { _fulfilSum: number; _fulfilCount: number }>();
    let fulfilSum = 0;
    let fulfilCount = 0;

    const byDay = new Map<string, { date: string; orders: number; spent: number; profit: number }>();

    for (const o of orders ?? []) {
      const spent = Number(o.total ?? 0);
      const retail = (retailOf.get(o.product_id) ?? Number(o.unit_price ?? 0)) * Number(o.quantity ?? 1);
      const profit = Math.max(0, retail - spent);
      stats.orders += 1;
      stats.spent += spent;
      stats.retail += retail;
      stats.profit += profit;
      if (o.status === "completed" || o.status === "delivered") stats.completed += 1;
      else if (o.status === "pending" || o.status === "processing") {
        stats.pending += 1;
        stats.pendingBill += spent;
      }

      stats.siteOrders += 1;
      stats.siteBill += spent;
      stats.siteRetail += spent * (1 + Number(reseller.markup_percent ?? 25) / 100);


      const src = String(o.source ?? "").toLowerCase();
      const bucket = src.includes("bot") || src.includes("telegram") ? stats.bot : src.includes("web") || src === "api" ? stats.website : stats.other;
      bucket.orders += 1;
      bucket.spent += spent;
      bucket.profit += profit;

      // Monthly sales / margin / fulfilment-time report
      const month = String(o.created_at ?? "").slice(0, 7);
      const m =
        byMonth.get(month) ??
        ({ month, orders: 0, cost: 0, sale: 0, margin: 0, marginPercent: 0, avgFulfilMinutes: null, _fulfilSum: 0, _fulfilCount: 0 } as any);
      m.orders += 1;
      m.cost += spent;
      m.sale += spent * markupRate;
      const done = o.status === "completed" || o.status === "delivered";
      if (done && o.created_at && o.updated_at) {
        const mins = (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()) / 60000;
        if (Number.isFinite(mins) && mins >= 0 && mins < 60 * 24 * 30) {
          m._fulfilSum += mins;
          m._fulfilCount += 1;
          fulfilSum += mins;
          fulfilCount += 1;
        }
      }
      byMonth.set(month, m);

      const date = String(o.created_at ?? "").slice(0, 10);
      const d = byDay.get(date) ?? { date, orders: 0, spent: 0, profit: 0 };
      d.orders += 1;
      d.spent += spent;
      d.profit += profit;
      byDay.set(date, d);
    }
    stats.daily = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
    stats.monthly = Array.from(byMonth.values())
      .map((m: any) => ({
        month: m.month,
        orders: m.orders,
        cost: Math.round(m.cost * 100) / 100,
        sale: Math.round(m.sale * 100) / 100,
        margin: Math.round((m.sale - m.cost) * 100) / 100,
        marginPercent: m.sale > 0 ? Math.round(((m.sale - m.cost) / m.sale) * 1000) / 10 : 0,
        avgFulfilMinutes: m._fulfilCount ? Math.round((m._fulfilSum / m._fulfilCount) * 10) / 10 : null,
      }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12);
    stats.avgFulfilMinutes = fulfilCount ? Math.round((fulfilSum / fulfilCount) * 10) / 10 : null;

    const myProducts = await loadMyProducts(db, reseller.id);

    return {
      linked: true,
      email: email || reseller.email || "",
      reseller: {
        id: reseller.id,
        name: reseller.name,
        api_key: reseller.api_key,
        balance: Number(reseller.balance ?? 0),
        discount_percent: Number(reseller.discount_percent ?? 0),
        is_active: Boolean(reseller.is_active),
        allow_website: Boolean(reseller.allow_website),
        allow_bot: Boolean(reseller.allow_bot),
        created_at: reseller.created_at,
        site_url: reseller.site_url ?? "",
        site_name: reseller.site_name ?? "",
        bot_username: reseller.bot_username ?? "",
        support_contact: reseller.support_contact ?? "",
        markup_percent: Number(reseller.markup_percent ?? 25),
        webhook_url: (reseller as any).webhook_url ?? "",
        webhook_secret: (reseller as any).webhook_secret ?? "",
        webhook_last_status: (reseller as any).webhook_last_status ?? "",
        webhook_last_at: (reseller as any).webhook_last_at ?? null,
      },
      stats,
      myProducts,
      orders: (orders ?? []).slice(0, 100),
      transactions: transactions ?? [],
      topups: topups ?? [],
    };
  });

/** Reseller regenerates their own API key. */
export const rotateMyApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const api_key = newKey();
    const { error } = await db.from("resellers").update({ api_key }).eq("id", reseller.id);
    if (error) throw new Error(error.message);
    return { api_key };
  });

/** Normalise whatever the reseller types into a clean https origin. */
function cleanOrigin(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Enter a valid domain, e.g. mystore.com");
  }
  if (!url.hostname.includes(".")) throw new Error("Enter a valid domain, e.g. mystore.com");
  return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
}

/** Reseller saves their own storefront domain / brand / bot settings. */
export const updateMySiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { site_url?: string; site_name?: string; bot_username?: string; support_contact?: string; markup_percent?: number }) => d,
  )
  .handler(async ({ data, context }) => {
    const { db, reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");

    const markup = Number(data.markup_percent ?? 25);
    if (!Number.isFinite(markup) || markup < 0 || markup > 1000) throw new Error("Markup must be between 0 and 1000%");

    const patch = {
      site_url: cleanOrigin(data.site_url ?? "") || null,
      site_name: String(data.site_name ?? "").trim().slice(0, 80) || null,
      bot_username: String(data.bot_username ?? "").trim().replace(/^@/, "").slice(0, 40) || null,
      support_contact: String(data.support_contact ?? "").trim().slice(0, 120) || null,
      markup_percent: Math.round(markup * 100) / 100,
    };

    const { error } = await db.from("resellers").update(patch).eq("id", reseller.id);
    if (error) throw new Error(error.message);
    return { ok: true, ...patch };
  });

/**
 * Reseller registers the URL that should receive live stock / price events.
 * Every alert our Telegram channel gets is POSTed there at the same moment.
 */
export const updateMyWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { webhook_url?: string; regenerate_secret?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { db, reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");

    const raw = String(data.webhook_url ?? "").trim();
    let url: string | null = null;
    if (raw) {
      try {
        const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        if (parsed.protocol !== "https:") throw new Error("bad");
        url = parsed.toString();
      } catch {
        throw new Error("Enter a valid https URL, e.g. https://mystore.com/api/qorix-stock");
      }
    }

    const patch: Record<string, unknown> = { webhook_url: url };
    if (data.regenerate_secret || (url && !(reseller as any).webhook_secret)) {
      patch["webhook_secret"] = newKey().replace(/[^a-zA-Z0-9]/g, "").slice(0, 48);
    }
    const { error } = await db.from("resellers").update(patch).eq("id", reseller.id);
    if (error) throw new Error(error.message);
    const { data: row } = await db
      .from("resellers")
      .select("webhook_url,webhook_secret")
      .eq("id", reseller.id)
      .maybeSingle();
    return {
      ok: true,
      webhook_url: (row as any)?.webhook_url ?? "",
      webhook_secret: (row as any)?.webhook_secret ?? "",
    };
  });

/** Reseller submits a balance top-up request for the admin to review. */
export const requestTopUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number; method?: string; txid?: string; sender_info?: string }) => d)
  .handler(async ({ data, context }) => {
    const { db, reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const amount = Math.round(Number(data.amount) * 100) / 100;
    if (!(amount > 0)) throw new Error("Enter a valid amount");
    const { error } = await db.from("reseller_topups").insert({
      reseller_id: reseller.id,
      amount,
      method: String(data.method ?? "manual").slice(0, 40),
      txid: String(data.txid ?? "").trim().slice(0, 120) || null,
      sender_info: String(data.sender_info ?? "").trim().slice(0, 200) || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Reseller price list (their discounted price + live stock). */
export const getResellerCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const [{ data: cats }, { data: prods }] = await Promise.all([
      db.from("categories").select("id,name,emoji").eq("is_active", true).order("sort_order"),
      db
        .from("products")
        .select("id,name,category_id,price,delivery_type,is_active,supplier_stock,supplier_id")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    const catName = new Map<string, string>((cats ?? []).map((c: any) => [c.id, c.name]));
    const discount = Number(reseller.discount_percent ?? 0);
    return (prods ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      category: catName.get(p.category_id) ?? "Uncategorised",
      retail: Number(p.price ?? 0),
      your_price: Math.max(0, Math.round(Number(p.price ?? 0) * (1 - discount / 100) * 100) / 100),
      delivery_type: p.delivery_type,
      stock: p.supplier_id ? Number(p.supplier_stock ?? 0) : null,
    }));
  });

/** Admin: list every reseller top-up request. */
export const listTopUpRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data } = await ctx.supabase
      .from("reseller_topups")
      .select("*, resellers(name,email)")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

/** Admin: approve (credits the wallet) or reject a top-up request. */
export const reviewTopUpRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "approved" | "rejected"; admin_note?: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const db = await adminDb();
    const { data: row } = await db.from("reseller_topups").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Request not found");
    if (row.status !== "pending") throw new Error("This request was already reviewed");

    if (data.status === "approved") {
      const { error } = await db.rpc("reseller_adjust_balance", {
        _reseller_id: row.reseller_id,
        _amount: Number(row.amount),
        _type: "credit",
        _reference: "topup:" + row.id,
        _note: data.admin_note ?? "Top-up approved",
      });
      if (error) throw new Error(error.message);
    }
    await db
      .from("reseller_topups")
      .update({ status: data.status, admin_note: data.admin_note ?? null })
      .eq("id", data.id);
    return { ok: true };
  });

/* ---------------------------------------------- automatic top-up gateways */
/* Same payment gateways the Telegram bot uses (Binance Pay, USDT BEP-20/TRC-20,
   Pay Kori bKash/Nagad/Rocket). Verification is always server -> gateway. */

export const listTopupMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const { resellerTopupMethods } = await import("@/lib/bot/engine.server");
    return await resellerTopupMethods();
  });

export const startAutoTopUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { method: string; amount: number }) => d)
  .handler(async ({ data, context }) => {
    const { reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const { startResellerTopup } = await import("@/lib/bot/engine.server");
    const r = await startResellerTopup(reseller.id, String(data.method), Number(data.amount));
    if ((r as any).error) throw new Error((r as any).error);
    return (r as any).deposit;
  });

export const checkAutoTopUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const { verifyResellerTopup } = await import("@/lib/bot/engine.server");
    return await verifyResellerTopup(reseller.id, String(data.id));
  });

export const listAutoTopUps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const { listResellerDeposits } = await import("@/lib/bot/engine.server");
    return await listResellerDeposits(reseller.id);
  });


/* ------------------------------------------------ reseller's own products */

/** Create or update a product that belongs to this reseller only. */
export const saveMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      name: string;
      emoji?: string;
      description?: string;
      price: number;
      delivery_type?: string;
      delivery_time?: string;
      is_active?: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { db, reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");

    const name = String(data.name ?? "").trim().slice(0, 120);
    if (name.length < 2) throw new Error("Product name is required");
    const price = Math.round(Number(data.price ?? 0) * 100) / 100;
    if (!Number.isFinite(price) || price < 0 || price > 100000) throw new Error("Enter a valid price");

    const patch = {
      name,
      emoji: String(data.emoji ?? "").trim().slice(0, 8) || "📦",
      description: String(data.description ?? "").trim().slice(0, 2000) || null,
      price,
      delivery_type: data.delivery_type === "manual" ? "manual" : "auto",
      delivery_time: String(data.delivery_time ?? "").trim().slice(0, 60) || null,
      is_active: data.is_active !== false,
      owner_reseller_id: reseller.id,
    };

    if (data.id) {
      const { data: owned } = await db.from("products").select("id").eq("id", data.id).eq("owner_reseller_id", reseller.id).maybeSingle();
      if (!owned) throw new Error("Product not found");
      const { error } = await db.from("products").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id, products: await loadMyProducts(db, reseller.id) };
    }

    const { data: created, error } = await db.from("products").insert(patch).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, id: created?.id, products: await loadMyProducts(db, reseller.id) };
  });

/** Delete one of the reseller's own products (and its unsold stock). */
export const deleteMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { db, reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const { data: owned } = await db.from("products").select("id").eq("id", data.id).eq("owner_reseller_id", reseller.id).maybeSingle();
    if (!owned) throw new Error("Product not found");
    await db.from("stock_items").delete().eq("product_id", data.id).eq("is_sold", false);
    // Keep sold history intact: deactivate instead of hard delete when orders exist.
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("product_id", data.id);
    if ((count ?? 0) > 0) await db.from("products").update({ is_active: false }).eq("id", data.id);
    else await db.from("products").delete().eq("id", data.id);
    return { ok: true, products: await loadMyProducts(db, reseller.id) };
  });

/** Append stock keys (one per line) to the reseller's own product. */
export const addMyStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string; content: string }) => d)
  .handler(async ({ data, context }) => {
    const { db, reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const { data: owned } = await db
      .from("products")
      .select("id")
      .eq("id", data.product_id)
      .eq("owner_reseller_id", reseller.id)
      .maybeSingle();
    if (!owned) throw new Error("Product not found");

    const lines = String(data.content ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 2000);
    if (!lines.length) throw new Error("Paste at least one stock line");

    const { error } = await db.from("stock_items").insert(lines.map((content) => ({ product_id: data.product_id, content })));
    if (error) throw new Error(error.message);
    return { ok: true, added: lines.length, products: await loadMyProducts(db, reseller.id) };
  });

/** Remove all unsold stock of one of the reseller's own products. */
export const clearMyStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { db, reseller } = await resolveReseller(context as any);
    if (!reseller) throw new Error("No reseller account linked to this login");
    const { data: owned } = await db
      .from("products")
      .select("id")
      .eq("id", data.product_id)
      .eq("owner_reseller_id", reseller.id)
      .maybeSingle();
    if (!owned) throw new Error("Product not found");
    await db.from("stock_items").delete().eq("product_id", data.product_id).eq("is_sold", false);
    return { ok: true, products: await loadMyProducts(db, reseller.id) };
  });
