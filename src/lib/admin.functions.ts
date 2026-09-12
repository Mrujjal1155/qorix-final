import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MANUAL_NOTE_PREFIX, parseStock, type StockFormat } from "@/lib/stock-format";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden");
}

export const isAdminUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context as any).supabase.rpc("has_role", {
      _user_id: (context as any).userId,
      _role: "admin",
    });
    return { isAdmin: Boolean(data) };
  });

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const [users, pendingPayments, ordersToday, completed, recent, prods] = await Promise.all([
      sb.from("bot_users").select("telegram_id", { count: "exact", head: true }),
      sb.from("payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()),
      sb.from("orders").select("total").eq("status", "completed"),
      sb.from("orders").select("*").order("created_at", { ascending: false }).limit(10),
      sb.from("products").select("id,supplier_id,is_active"),
    ]);

    const revenue = (completed.data ?? []).reduce((a: number, r: any) => a + Number(r.total), 0);
    const products = (prods.data ?? []) as any[];
    const inHouse = products.filter((p) => !p.supplier_id);
    const supplierProducts = products.filter((p) => p.supplier_id);
    return {
      totalUsers: users.count ?? 0,
      pendingPayments: pendingPayments.count ?? 0,
      ordersToday: ordersToday.count ?? 0,
      revenue,
      recentOrders: recent.data ?? [],
      productStats: {
        total: products.length,
        active: products.filter((p) => p.is_active).length,
        inactive: products.filter((p) => !p.is_active).length,
        inHouse: inHouse.length,
        inHouseActive: inHouse.filter((p) => p.is_active).length,
        supplier: supplierProducts.length,
        supplierActive: supplierProducts.filter((p) => p.is_active).length,
      },
    };
  });

/* --------------------------------------------------------------- analytics */

type AnalyticsRange = "day" | "week" | "month" | "quarter";

export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { range?: AnalyticsRange }) => ({ range: d?.range ?? "week" }))
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);

    const days = data.range === "day" ? 1 : data.range === "week" ? 7 : data.range === "month" ? 30 : 90;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const [ordersRes, supRes] = await Promise.all([
      sb
        .from("orders")
        .select("id,created_at,status,total,quantity,product_id,product_name,source")
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: true }),
      sb.from("supplier_products").select("product_id,cost_price"),
    ]);

    const costMap: Record<string, number> = {};
    for (const s of (supRes.data ?? []) as any[]) {
      if (s.product_id) costMap[s.product_id] = Number(s.cost_price ?? 0);
    }

    const orders = (ordersRes.data ?? []) as any[];
    const buckets: Record<string, { date: string; orders: number; revenue: number; profit: number; units: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, orders: 0, revenue: 0, profit: 0, units: 0 };
    }

    let totalOrders = 0;
    let completedOrders = 0;
    let pendingOrders = 0;
    let revenue = 0;
    let profit = 0;
    let units = 0;
    const bySource: Record<string, number> = {};
    const byProduct: Record<string, { name: string; units: number; revenue: number; profit: number }> = {};

    for (const o of orders) {
      totalOrders++;
      const src = o.source || "bot";
      bySource[src] = (bySource[src] ?? 0) + 1;
      if (o.status !== "completed") {
        if (o.status === "pending") pendingOrders++;
        continue;
      }
      completedOrders++;
      const key = new Date(o.created_at).toISOString().slice(0, 10);
      const total = Number(o.total ?? 0);
      const qty = Number(o.quantity ?? 1);
      const cost = (o.product_id ? (costMap[o.product_id] ?? 0) : 0) * qty;
      const p = total - cost;
      revenue += total;
      profit += p;
      units += qty;
      const b = buckets[key];
      if (b) {
        b.orders++;
        b.revenue += total;
        b.profit += p;
        b.units += qty;
      }
      const pk = o.product_id ?? o.product_name ?? "unknown";
      const entry = byProduct[pk] ?? { name: o.product_name ?? "Unknown", units: 0, revenue: 0, profit: 0 };
      entry.units += qty;
      entry.revenue += total;
      entry.profit += p;
      byProduct[pk] = entry;
    }

    const series = Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
    const topProducts = Object.values(byProduct)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      range: data.range,
      days,
      series,
      totals: {
        orders: totalOrders,
        completedOrders,
        pendingOrders,
        revenue,
        profit,
        units,
        avgOrderValue: completedOrders ? revenue / completedOrders : 0,
        margin: revenue ? (profit / revenue) * 100 : 0,
      },
      bySource,
      topProducts,
    };
  });

/* --------------------------------------------------------------- catalogue */

export const getCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const [cats, prods, stock, sups] = await Promise.all([
      sb.from("categories").select("*").order("sort_order"),
      sb.from("products").select("*").order("sort_order"),
      // Only unsold rows, and never the whole history: pulling every stock row
      // (sold ones included) blew the worker's memory/CPU budget on big
      // catalogues and Cloudflare answered the page with Error 1102.
      sb.from("stock_items").select("product_id").eq("is_sold", false).limit(5000),
      sb.from("suppliers").select("id,name,key"),
    ]);
    const counts: Record<string, number> = {};
    for (const s of stock.data ?? []) counts[s.product_id] = (counts[s.product_id] ?? 0) + 1;
    const supMap: Record<string, string> = {};
    for (const s of sups.data ?? []) supMap[s.id] = s.name || s.key;
    return {
      categories: cats.data ?? [],
      suppliers: (sups.data ?? []).map((s: any) => ({ id: s.id, name: s.name || s.key })),
      products: (prods.data ?? []).map((p: any) => ({
        ...p,
        stock: p.supplier_id ? Number(p.supplier_stock ?? 0) : (counts[p.id] ?? 0),
        supplier_name: p.supplier_id ? (supMap[p.supplier_id] ?? "Supplier") : null,
      })),
    };
  });

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; emoji?: string; sort_order?: number; channel?: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const row = {
      name: data.name,
      emoji: data.emoji ?? "📁",
      sort_order: data.sort_order ?? 0,
      channel: data.channel ?? "both",
    };
    const { error } = data.id
      ? await sb.from("categories").update(row).eq("id", data.id)
      : await sb.from("categories").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------- category ⇄ product assignment (link only) */

export const getCategoryProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { category_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await (context as any).supabase
      .from("product_categories")
      .select("product_id")
      .eq("category_id", data.category_id);
    if (error) throw new Error(error.message);
    return { product_ids: (rows ?? []).map((r: any) => r.product_id as string) };
  });

export const saveCategoryProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { category_id: string; product_ids: string[] }) => ({
    category_id: String(d.category_id),
    product_ids: Array.from(new Set((d.product_ids ?? []).map(String))),
  }))
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const del = await sb.from("product_categories").delete().eq("category_id", data.category_id);
    if (del.error) throw new Error(del.error.message);
    if (data.product_ids.length) {
      const ins = await sb
        .from("product_categories")
        .insert(data.product_ids.map((id) => ({ product_id: id, category_id: data.category_id })));
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true, count: data.product_ids.length };
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      category_id?: string | null;
      name: string;
      emoji?: string;
      telegram_custom_emoji_id?: string | null;
      description?: string;
      price: number;
      old_price?: number | null;
      delivery_type: "auto" | "manual";
      manual_note?: string;
      important_note?: string | null;
      quick_guide?: string | null;
      details?: { label: string; value: string }[] | null;
      image_url?: string | null;
      delivery_time?: string | null;
      badge?: string | null;
      is_active?: boolean;
      sort_order?: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const { id, ...rest } = data;
    const row = {
      ...rest,
      category_id: rest.category_id || null,
      old_price: rest.old_price ?? null,
      image_url: rest.image_url || null,
      delivery_time: rest.delivery_time || null,
      badge: rest.badge || null,
      important_note: rest.important_note || null,
      quick_guide: rest.quick_guide || null,
      details: (rest.details ?? []).filter((d) => d && (d.label?.trim() || d.value?.trim())),
      telegram_custom_emoji_id: rest.telegram_custom_emoji_id || null,
    };
    if (id) {
      const { data: before } = await sb.from("products").select("is_active").eq("id", id).maybeSingle();
      const { data: updated, error } = await sb.from("products").update(row).eq("id", id).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      // Turning a product ON/OFF is pushed to reseller webhooks immediately so
      // their sites and bots only ever show what is live here.
      const was = (before as any)?.is_active !== false;
      const now = (updated as any)?.is_active !== false;
      if (updated && was !== now) {
        const { pushResellerEvent } = await import("@/lib/reseller/webhook.server");
        await pushResellerEvent(now ? "new" : "removed", updated);
      }
      return { ok: true };
    }

    const { data: created, error } = await sb.from("products").insert(row).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    // A brand-new live product gets the NEW PRODUCT card in the channel and in
    // every bot chat, exactly like an auto-listed supplier product.
    if (created && (created as any).is_active !== false) {
      try {
        const { announceNewProduct } = await import("@/lib/bot/engine.server");
        await announceNewProduct(created);
      } catch (e) {
        console.error("new-product announce failed:", e);
      }
    }
    if (created) {
      const { pushResellerEvent } = await import("@/lib/reseller/webhook.server");
      await pushResellerEvent((created as any).is_active === false ? "removed" : "new", created);
    }
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const { data: existing } = await sb.from("products").select("*").eq("id", data.id).maybeSingle();
    const { error } = await sb.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (existing && (existing as any).is_active !== false) {
      try {
        const { announceProductRemoved } = await import("@/lib/bot/engine.server");
        await announceProductRemoved(existing);
      } catch (e) {
        console.error("removed-product announce failed:", e);
      }
    }
    if (existing) {
      const { pushResellerEvent } = await import("@/lib/reseller/webhook.server");
      await pushResellerEvent("removed", existing);
    }
    return { ok: true };
  });

export const addStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string; lines: string; format?: StockFormat }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const items = parseStock(data.lines, data.format ?? "auto");
    const rows = items.map((content) => ({ product_id: data.product_id, content }));
    if (!rows.length) return { added: 0 };
    const { error } = await sb.from("stock_items").insert(rows);
    if (error) throw new Error(error.message);
    try {
      const { notifyRestock } = await import("@/lib/bot/engine.server");
      await notifyRestock(data.product_id, rows.length);
    } catch (e) {
      console.error("restock notify failed:", e);
    }
    return { added: rows.length };
  });

export const listStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows } = await (context as any).supabase
      .from("stock_items")
      .select("id,content,is_sold,sold_to,created_at")
      .eq("product_id", data.product_id)
      .order("created_at", { ascending: true })
      .limit(200);
    return rows ?? [];
  });

export const deleteStockItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase
      .from("stock_items")
      .delete()
      .eq("id", data.id)
      .eq("is_sold", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* per-product manual delivery note (shown to admins in Telegram + website) */

export const getManualNote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row } = await (context as any).supabase
      .from("bot_settings")
      .select("value")
      .eq("key", `${MANUAL_NOTE_PREFIX}${data.product_id}`)
      .maybeSingle();
    return { note: (row?.value as string) ?? "" };
  });

export const saveManualNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string; note: string }) => ({
    product_id: String(d.product_id),
    note: String(d.note ?? "").slice(0, 2000),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase
      .from("bot_settings")
      .upsert({ key: `${MANUAL_NOTE_PREFIX}${data.product_id}`, value: data.note }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ orders */

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; source?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    // Unpaid gateway checkouts older than 30 minutes fail automatically.
    await expireStaleAwaitingOrders(sb);
    let q = sb.from("orders").select("*").order("created_at", { ascending: false }).limit(200);
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    if (data?.source && data.source !== "all") q = q.eq("source", data.source);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const orders = rows ?? [];
    if (!orders.length) return orders;

    // Attach supplier info so admins can see which API/supplier an order came from.
    const productIds = [...new Set(orders.map((o: any) => o.product_id).filter(Boolean))];
    if (!productIds.length) return orders;
    const { data: prods } = await sb
      .from("products")
      .select("id,supplier_id,supplier_external_id")
      .in("id", productIds);
    const supplierIds = [...new Set((prods ?? []).map((p: any) => p.supplier_id).filter(Boolean))];
    const { data: sups } = supplierIds.length
      ? await sb.from("suppliers").select("id,key,name").in("id", supplierIds)
      : { data: [] as any[] };
    const supById = new Map((sups ?? []).map((s: any) => [s.id, s]));
    const prodById = new Map((prods ?? []).map((p: any) => [p.id, p]));
    return orders.map((o: any) => {
      const p: any = prodById.get(o.product_id);
      const s: any = p?.supplier_id ? supById.get(p.supplier_id) : null;
      return {
        ...o,
        supplier_name: s?.name ?? null,
        supplier_key: s?.key ?? null,
        supplier_external_id: p?.supplier_external_id ?? null,
        fulfilment: s ? "api" : "manual",
      };
    });
  });


export const deliverOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; content: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const { data: order, error } = await sb
      .from("orders")
      .update({ status: "completed", delivered_content: data.content })
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (order?.source === "website" || !order?.telegram_id) return { ok: true };
    const { sendMessage } = await import("@/lib/telegram.server");
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const items = parseStock(data.content, "auto");
    const parts = items.length ? items : [data.content];
    await sendMessage(
      order.telegram_id,
      `✅ <b>Order #${order.order_no}</b> delivered!\n${order.quantity}× ${esc(order.product_name)}\n` +
        `Sending <b>${parts.length}</b> item(s) below 👇`,
    );
    for (let i = 0; i < parts.length; i++) {
      await sendMessage(
        order.telegram_id,
        `📦 <b>${esc(order.product_name)} — ${i + 1} of ${parts.length}</b>\n<pre>${esc(parts[i]!)}</pre>`,
      );
    }
    return { ok: true };
  });

export const retryAutoDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { retrySupplierDelivery } = await import("@/lib/suppliers/fulfil.server");
    return await retrySupplierDelivery(data.id);
  });

export const checkSupplierBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: sups } = await (context as any).supabase
      .from("suppliers")
      .select("id,key,name,is_enabled")
      .eq("is_enabled", true);
    const { supplierBalance } = await import("@/lib/suppliers/api.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: { id: string; name: string; balance: number | null; currency: string; error?: string }[] = [];
    for (const s of sups ?? []) {
      const { data: full } = await (supabaseAdmin as any).from("suppliers").select("*").eq("id", s.id).maybeSingle();
      try {
        const b = await supplierBalance(full as any);
        out.push({ id: s.id, name: s.name ?? s.key, balance: Number(b.balance), currency: b.currency });
      } catch (e) {
        out.push({
          id: s.id,
          name: s.name ?? s.key,
          balance: null,
          currency: "",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return out;
  });

export const setOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id: string; status: "pending" | "completed" | "cancelled" | "failed" | "refunded" }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/* ------------------------------------------------- unpaid / failed orders */

const AWAITING_PAYMENT_MINUTES = 30;

/** Mark every checkout that stayed unpaid for 30 minutes as failed. */
async function expireStaleAwaitingOrders(sb: any) {
  const cutoff = new Date(Date.now() - AWAITING_PAYMENT_MINUTES * 60_000).toISOString();
  const { data } = await sb
    .from("orders")
    .select("id,meta")
    .eq("status", "awaiting_payment")
    .lt("created_at", cutoff)
    .limit(200);
  if (!data?.length) return 0;
  await sb
    .from("orders")
    .update({ status: "failed" })
    .in("id", data.map((o: any) => o.id));
  const deposits = [...new Set(data.map((o: any) => (o.meta ?? {}).deposit_id).filter(Boolean))];
  if (deposits.length) {
    await sb
      .from("binance_deposits")
      .update({ status: "expired" })
      .in("id", deposits)
      .neq("status", "credited");
  }
  return data.length;
}

/**
 * Payment arrived (often a little short) — reopen the order so the normal
 * "Deliver" / "Retry API" buttons can finish it against the same order id.
 */
export const markOrderPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; note?: string }) => ({ id: String(d.id), note: d.note ?? "" }))
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const { data: order } = await sb.from("orders").select("*").eq("id", data.id).maybeSingle();
    if (!order) throw new Error("Order not found");
    const meta = { ...(order.meta ?? {}), admin_paid_note: data.note || null, reopened_at: new Date().toISOString() };
    const { error } = await sb.from("orders").update({ status: "pending", meta }).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (order.telegram_id) {
      const { sendMessage } = await import("@/lib/telegram.server");
      await sendMessage(
        Number(order.telegram_id),
        `\u2705 <b>Order #${order.order_no}</b> payment accepted.\nWe are processing your delivery now.`,
      ).catch(() => {});
    }
    return { ok: true };
  });

/** Refund exactly what the buyer actually paid into their wallet. */
export const refundOrderToWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; amount: number; note?: string }) => ({
    id: String(d.id),
    amount: Math.round(Number(d.amount) * 100) / 100,
    note: d.note ?? "",
  }))
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    if (!(data.amount > 0)) throw new Error("Refund amount must be greater than 0");
    const { data: order } = await sb.from("orders").select("*").eq("id", data.id).maybeSingle();
    if (!order) throw new Error("Order not found");
    if (order.status === "refunded") throw new Error("This order was already refunded");
    const reference = `order-${order.order_no}`;
    const note = data.note || `Refund for order #${order.order_no}`;

    if (order.telegram_id) {
      const { data: user } = await sb
        .from("bot_users")
        .select("balance")
        .eq("telegram_id", order.telegram_id)
        .maybeSingle();
      if (!user) throw new Error("Bot user not found");
      const balance = Math.round((Number(user.balance ?? 0) + data.amount) * 100) / 100;
      await sb.from("bot_users").update({ balance }).eq("telegram_id", order.telegram_id);
      await sb.from("transactions").insert({
        telegram_id: order.telegram_id,
        type: "refund",
        amount: data.amount,
        method: "wallet",
        reference,
        note,
      });
      const { sendMessage } = await import("@/lib/telegram.server");
      await sendMessage(
        Number(order.telegram_id),
        `\u{1F4B0} <b>Refund added to your wallet</b>\nOrder: <b>#${order.order_no}</b>\nAmount: <b>$${data.amount.toFixed(2)}</b>\nNew balance: <b>$${balance.toFixed(2)}</b>`,
      ).catch(() => {});
    } else if (order.user_id) {
      const { data: profile } = await sb
        .from("profiles")
        .select("wallet_balance")
        .eq("id", order.user_id)
        .maybeSingle();
      if (!profile) throw new Error("Customer profile not found");
      const balance = Math.round((Number(profile.wallet_balance ?? 0) + data.amount) * 100) / 100;
      await sb.from("profiles").update({ wallet_balance: balance }).eq("id", order.user_id);
      await sb.from("wallet_transactions").insert({
        user_id: order.user_id,
        type: "refund",
        amount: data.amount,
        balance_after: balance,
        reference,
        note,
      });
    } else {
      throw new Error("This order has no wallet to refund into");
    }

    const meta = { ...(order.meta ?? {}), refund_amount: data.amount, refund_note: note };
    await sb.from("orders").update({ status: "refunded", meta }).eq("id", data.id);
    return { ok: true, amount: data.amount };
  });

/* ---------------------------------------------------------------- payments */

export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await (context as any).supabase
      .from("payment_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const decidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean; note?: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const { data: req } = await sb.from("payment_requests").select("*").eq("id", data.id).maybeSingle();
    if (!req) throw new Error("Request not found");

    await sb
      .from("payment_requests")
      .update({ status: data.approve ? "approved" : "rejected", admin_note: data.note ?? null })
      .eq("id", data.id);

    const { sendMessage } = await import("@/lib/telegram.server");
    if (data.approve) {
      const { data: user } = await sb
        .from("bot_users")
        .select("balance")
        .eq("telegram_id", req.telegram_id)
        .maybeSingle();
      await sb
        .from("bot_users")
        .update({ balance: Number(user?.balance ?? 0) + Number(req.amount) })
        .eq("telegram_id", req.telegram_id);
      await sb.from("transactions").insert({
        telegram_id: req.telegram_id,
        type: "deposit",
        amount: req.amount,
        method: req.method,
        reference: req.txid,
      });
      await sendMessage(
        req.telegram_id,
        `✅ Your deposit of $${Number(req.amount).toFixed(2)} has been approved and added to your balance.`,
      );
    } else {
      await sendMessage(
        req.telegram_id,
        `❌ Your deposit request was rejected.${data.note ? `\nReason: ${data.note}` : ""}`,
      );
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------- users */

export const listBotUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    let q = sb.from("bot_users").select("*").order("created_at", { ascending: false }).limit(200);
    if (data?.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = /^\d+$/.test(s) ? q.eq("telegram_id", Number(s)) : q.ilike("username", `%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adjustBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { telegram_id: number; amount: number; note?: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const { data: user } = await sb
      .from("bot_users")
      .select("balance")
      .eq("telegram_id", data.telegram_id)
      .maybeSingle();
    if (!user) throw new Error("User not found");
    await sb
      .from("bot_users")
      .update({ balance: Number(user.balance) + Number(data.amount) })
      .eq("telegram_id", data.telegram_id);
    await sb.from("transactions").insert({
      telegram_id: data.telegram_id,
      type: "admin",
      amount: data.amount,
      note: data.note ?? "Dashboard adjustment",
    });
    const { sendMessage } = await import("@/lib/telegram.server");
    await sendMessage(
      data.telegram_id,
      `💰 Your balance was adjusted by $${Number(data.amount).toFixed(2)}.`,
    );
    return { ok: true };
  });

export const setBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { telegram_id: number; banned: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase
      .from("bot_users")
      .update({ is_banned: data.banned })
      .eq("telegram_id", data.telegram_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const messageUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { telegram_id: number; text: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { sendMessage } = await import("@/lib/telegram.server");
    const res = await sendMessage(data.telegram_id, data.text);
    return { ok: res.ok };
  });

export const broadcastMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; image_url?: string }) => {
    const text = String(d.text ?? "").trim();
    const image_url = String(d.image_url ?? "").trim();
    if (!text && !image_url) throw new Error("Write a message or add an image URL");
    // Accept a public https image URL or a Telegram file_id.
    if (image_url && /\s/.test(image_url)) throw new Error("Image must be one URL or one Telegram file_id");
    if (image_url && /^https?:\/\//i.test(image_url) === false && image_url.length < 20)
      throw new Error("Image URL must start with http(s):// (or paste a Telegram file_id)");
    return { text, image_url };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runBroadcast } = await import("@/lib/bot/broadcast.server");
    return runBroadcast({
      text: data.text,
      ...(data.image_url ? { photo: data.image_url } : {}),
    });
  });


/* ------------------------------------------------------------ redeem codes */

export const listCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await (context as any).supabase
      .from("redeem_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    return data ?? [];
  });

export const generateCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { count: number; amount: number }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const count = Math.min(Math.max(1, Math.floor(data.count)), 200);
    const rows = Array.from({ length: count }, () => ({
      code: "GIFT" + Math.random().toString(36).slice(2, 10).toUpperCase(),
      amount: data.amount,
    }));
    const { error } = await sb.from("redeem_codes").insert(rows);
    if (error) throw new Error(error.message);
    return { codes: rows.map((r) => r.code) };
  });

/* ---------------------------------------------------------------- settings */

export const getBotSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const out: Record<string, string> = {};
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await sb
        .from("bot_settings")
        .select("key,value")
        .order("key", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) out[row.key] = row.value ?? "";
      if (!data || data.length < pageSize) break;
    }
    return out;
  });

export const saveBotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { values: Record<string, string> }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const rows = Object.entries(data.values).map(([key, value]) => ({ key, value }));
    const { error } = await sb.from("bot_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const registerWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const key = process.env["TELEGRAM_BOT_TOKEN"] || process.env["TELEGRAM_API_KEY"];
    if (!key)
      return {
        ok: false,
        message:
          "TELEGRAM_BOT_TOKEN is not configured yet. Add the bot token from @BotFather before connecting the webhook.",
      };
    const { setWebhook, getWebhookInfo, setMyCommands } = await import("@/lib/telegram.server");
    const { createHash } = await import("crypto");
    const deriveTelegramWebhookSecret = (k: string) =>
      createHash("sha256").update(`telegram-webhook:${k}`).digest("base64url");
    // The id-preview host redirects through auth; use the stable public dev host instead.
    const origin = data.origin
      .replace(/\/$/, "")
      .replace(/^https:\/\/id-preview--([0-9a-f-]{36})\.(.+)$/, "https://project--$1-dev.$2")
      // sandbox/preview iframe host -> stable public dev host
      .replace(/^https:\/\/([0-9a-f-]{36})\.lovableproject\.com$/, "https://project--$1-dev.lovable.app")
      .replace(/^https:\/\/([0-9a-f-]{36})\.(?:sandbox\.)?lovable\.app$/, "https://project--$1-dev.lovable.app");
    const url = `${origin}/api/public/telegram/webhook`;
    const res = await setWebhook(url, process.env["TELEGRAM_WEBHOOK_SECRET"] || deriveTelegramWebhookSecret(key));
    // Admin commands (/admin) are registered only in admin private chats.
    const { data: settingRows } = await context.supabase
      .from("bot_settings")
      .select("key,value")
      .in("key", ["admin_telegram_ids", "admin_ids"]);
    const adminChatIds = (settingRows ?? [])
      .map((r: any) => String(r.value ?? ""))
      .join(",")
      .split(/[,\s]+/)
      .filter(Boolean);
    await setMyCommands(adminChatIds);

    const info = await getWebhookInfo();
    return {
      ok: Boolean(res.ok),
      message: res.ok
        ? `Webhook registered: ${url}`
        : res.description?.toLowerCase().includes("unauthorized")
          ? "Telegram rejected the bot token (Unauthorized). Update TELEGRAM_BOT_TOKEN with a fresh token from @BotFather and try again."
          : (res.description ?? "Webhook registration failed. Please try again."),
      info: info.result ?? null,
    };
  });

export const checkBotToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // The connector is only usable together with a Lovable gateway key; on a
    // self-hosted deploy the direct bot token is the only working path.
    const connKey = process.env["LOVABLE_API_KEY"] ? process.env["TELEGRAM_API_KEY"] : undefined;
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token && !connKey) {
      return {
        status: "missing" as const,
        message:
          "Telegram is not connected yet. Connect Telegram from connectors or add TELEGRAM_BOT_TOKEN, then reload this page.",
      };
    }
    if (!connKey && token && !/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token.trim())) {
      return {
        status: "malformed" as const,
        message:
          "The saved TELEGRAM_BOT_TOKEN does not look like a valid token. It should look like 123456789:AA... — copy it again from @BotFather.",
      };
    }
    try {
      const { getMe } = await import("@/lib/telegram.server");
      const me = await getMe();
      if (!me.ok) {
        return {
          status: "invalid" as const,
          message:
            me.description?.includes("Unauthorized") || me.description?.includes("401")
              ? "Telegram rejected this token (Unauthorized). The token is wrong or was revoked — generate a new one with /token in @BotFather and update the secret."
              : `Telegram could not verify the bot: ${me.description ?? "unknown error"}`,
        };
      }
      return {
        status: "ok" as const,
        username: me.result?.username as string | undefined,
        message: `Connected as @${me.result?.username ?? "unknown"}`,
      };
    } catch (e) {
      return {
        status: "error" as const,
        message: e instanceof Error ? e.message : "Could not reach Telegram right now. Try again.",
      };
    }
  });

export const getWebhookStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const key = process.env["TELEGRAM_BOT_TOKEN"] || process.env["TELEGRAM_API_KEY"];
    const origin = data.origin
      .replace(/\/$/, "")
      .replace(/^https:\/\/id-preview--([0-9a-f-]{36})\.(.+)$/, "https://project--$1-dev.$2")
      .replace(/^https:\/\/([0-9a-f-]{36})\.lovableproject\.com$/, "https://project--$1-dev.lovable.app")
      .replace(/^https:\/\/([0-9a-f-]{36})\.(?:sandbox\.)?lovable\.app$/, "https://project--$1-dev.lovable.app");
    const expectedUrl = `${origin}/api/public/telegram/webhook`;

    if (!key) {
      return {
        configured: false as const,
        expectedUrl,
        error: null as string | null,
        info: null,
        matches: false,
        lastUpdate: null as null | { at: string; kind: string; from: string },
        botId: null as number | null,
        botUsername: null as string | null,
      };
    }

    const { getWebhookInfo, getMe } = await import("@/lib/telegram.server");
    let info: any = null;
    let me: any = null;
    let error: string | null = null;
    try {
      [info, me] = await Promise.all([getWebhookInfo(), getMe()]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Telegram API call failed";
    }
    // This is already an authenticated admin request. Use its RLS-scoped
    // client so status rendering does not depend on the service-role secret.
    const { data: rows } = await (context.supabase as any)
      .from("bot_settings")
      .select("key,value")
      .in("key", ["webhook_last_update_at", "webhook_last_update_kind", "webhook_last_update_from"]);
    const map: Record<string, string> = {};
    for (const r of rows ?? []) map[r.key] = r.value ?? "";

    const current = (info?.result?.url ?? "") as string;
    return {
      configured: true as const,
      expectedUrl,
      error,
      info: info?.result ?? null,
      matches: current === expectedUrl,
      lastUpdate: map["webhook_last_update_at"]
        ? {
            at: map["webhook_last_update_at"]!,
            kind: map["webhook_last_update_kind"] ?? "unknown",
            from: map["webhook_last_update_from"] ?? "unknown",
          }
        : null,
      botId: typeof me?.result?.id === "number" ? me.result.id : null,
      botUsername: (me?.result?.username as string | undefined) ?? null,
    };
  });


export const checkBinanceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    try {
      const { checkBinanceKeys } = await import("@/lib/binance.server");
      return await checkBinanceKeys();
    } catch (e) {
      return {
        ok: false as const,
        saved: false as const,
        message: e instanceof Error ? e.message : "Could not reach Binance.",
      };
    }
  });

export const saveBinanceKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { apiKey: string; secretKey: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const apiKey = data.apiKey.trim();
    const secretKey = data.secretKey.trim();
    if (apiKey.length < 10 || secretKey.length < 10) {
      return { ok: false as const, message: "Please enter both API Key and Secret Key correctly." };
    }
    const { validateCreds } = await import("@/lib/binance.server");
    const check = await validateCreds({ apiKey, secretKey });
    if (!check.ok) return { ok: false as const, message: check.message };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("binance_credentials")
      .upsert({ id: 1, api_key: apiKey, api_secret: secretKey }, { onConflict: "id" });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, message: "Binance API keys saved and verified." };
  });

export const listCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await (context as any).supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const saveCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; percent: number; amount_off: number; max_uses: number }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const code = data.code.trim().toUpperCase();
    if (!code) throw new Error("Coupon code is required");
    const { error } = await (context as any).supabase.from("coupons").upsert(
      {
        code,
        percent: Number(data.percent) || 0,
        amount_off: Number(data.amount_off) || 0,
        max_uses: Number(data.max_uses) || 0,
        is_active: true,
      },
      { onConflict: "code" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase
      .from("coupons")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------- hero showcase items */

export const listHeroItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await (context as any).supabase
      .from("hero_items")
      .select("*")
      .order("sort_order");
    return data ?? [];
  });

export const saveHeroItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id?: string; name: string; image_url?: string; accent?: string; sort_order?: number; is_active?: boolean }) => {
      const name = String(d.name ?? "").trim().slice(0, 60);
      if (!name) throw new Error("Name is required");
      return { ...d, name };
    },
  )
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const row = {
      name: data.name,
      image_url: data.image_url?.trim() || null,
      accent: data.accent || "primary",
      sort_order: data.sort_order ?? 0,
      is_active: data.is_active ?? true,
    };
    const { error } = data.id
      ? await sb.from("hero_items").update(row).eq("id", data.id)
      : await sb.from("hero_items").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteHeroItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase.from("hero_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------- image upload (storage) */

const UPLOAD_BUCKET = "public-images";
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3MB

export const uploadImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { filename: string; dataUrl: string }) => {
    const m = /^data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(d.dataUrl ?? "");
    if (!m) throw new Error("Only PNG / JPG / WEBP / GIF images can be uploaded");
    const base64 = m[3]!;
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > MAX_UPLOAD_BYTES) throw new Error("Image size must not exceed 3MB");
    return { contentType: m[1]!, base64, filename: String(d.filename ?? "image").slice(-60) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const buckets = await supabaseAdmin.storage.listBuckets();
    if (!(buckets.data ?? []).some((b: any) => b.name === UPLOAD_BUCKET)) {
      await supabaseAdmin.storage.createBucket(UPLOAD_BUCKET, {
        public: true,
        fileSizeLimit: MAX_UPLOAD_BYTES,
      });
    }

    const ext = (data.filename.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const binary = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));

    const { error } = await supabaseAdmin.storage
      .from(UPLOAD_BUCKET)
      .upload(path, binary, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);

    const { data: pub } = supabaseAdmin.storage.from(UPLOAD_BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl };
  });

/* ------------------------------------------------- product icon utilities */

/**
 * Set the default product icon (plain emoji or Telegram Premium custom emoji)
 * and optionally push it onto products that have no icon of their own —
 * e.g. everything auto-listed from a supplier API.
 */
export const applyProductIcon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      emoji: string;
      custom_emoji_id?: string | null;
      scope: "default_only" | "missing" | "supplier" | "all";
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);

    const glyph = (data.emoji || "📦").trim().slice(0, 8) || "📦";
    const customId = String(data.custom_emoji_id ?? "").trim();
    if (customId && !/^\d{8,}$/.test(customId)) throw new Error("Premium emoji ID must be numeric");

    const stored = customId ? `${customId}|${glyph}` : glyph;
    const { error: setErr } = await sb
      .from("bot_settings")
      .upsert({ key: "ui_icon_prod_icon_default", value: stored }, { onConflict: "key" });
    if (setErr) throw new Error(setErr.message);

    let updated = 0;
    if (data.scope !== "default_only") {
      let q = sb
        .from("products")
        .update({ emoji: glyph, telegram_custom_emoji_id: customId || null })
        .select("id");
      if (data.scope === "missing") q = q.is("telegram_custom_emoji_id", null);
      if (data.scope === "supplier") q = q.not("supplier_id", "is", null);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      updated = rows?.length ?? 0;
    }

    return { ok: true, updated, value: stored };
  });

/* ------------------------------------------------- bot front-page ordering */

/** Every product the bot can sell — in-house + all supplier ones — with source. */
export const listBotProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const [prods, sups, stock] = await Promise.all([
      sb
        .from("products")
        .select(
          "id,name,emoji,price,is_active,sort_order,featured_rank,supplier_id,supplier_external_id,supplier_stock,delivery_type,category_id",
        )
        .order("name"),
      sb.from("suppliers").select("id,name"),
      sb.from("stock_items").select("product_id,is_sold"),
    ]);
    const supplierNames: Record<string, string> = {};
    for (const s of sups.data ?? []) supplierNames[s.id] = s.name;
    const counts: Record<string, number> = {};
    for (const s of stock.data ?? []) if (!s.is_sold) counts[s.product_id] = (counts[s.product_id] ?? 0) + 1;

    const rows = (prods.data ?? []).map((p: any) => ({
      ...p,
      source: p.supplier_id ? (supplierNames[p.supplier_id] ?? "Supplier") : "In-house",
      is_supplier: Boolean(p.supplier_id),
      stock: p.supplier_id ? Number(p.supplier_stock ?? 0) : (counts[p.id] ?? 0),
    }));
    rows.sort((a: any, b: any) => {
      const ra = Number(a.featured_rank ?? 0) || Number.MAX_SAFE_INTEGER;
      const rb = Number(b.featured_rank ?? 0) || Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name));
    });
    return rows;
  });

/** 0 = not pinned. 1,2,3… = position on the bot's first page. */
export const setFeaturedRank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; featured_rank: number }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const rank = Math.max(0, Math.min(999, Math.round(Number(data.featured_rank) || 0)));
    const { error } = await sb.from("products").update({ featured_rank: rank }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, featured_rank: rank };
  });

/** Renumber pinned products to a clean 1..N sequence. */
export const normalizeFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);
    const { data: rows } = await sb
      .from("products")
      .select("id,name,featured_rank")
      .gt("featured_rank", 0)
      .order("featured_rank")
      .order("name");
    let i = 1;
    for (const r of rows ?? []) {
      if (Number(r.featured_rank) !== i) await sb.from("products").update({ featured_rank: i }).eq("id", r.id);
      i++;
    }
    return { ok: true, count: (rows ?? []).length };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const to = (data.to ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return { ok: false, message: "Enter a valid email address" };
    }

    const sb = (context as any).supabase;
    const { data: rows } = await sb.from("bot_settings").select("key,value").in("key", ["bot_name"]);
    const siteName =
      (rows ?? []).find((r: any) => r.key === "bot_name")?.value?.trim() || "Qorix Store";

    const { sendResendEmail, getEmailBrand } = await import("@/lib/email/resend.server");
    const { logoUrl } = await getEmailBrand();
    const { testEmail } = await import("@/lib/email/templates");
    const tpl = testEmail({ siteName, logoUrl });

    const res = await sendResendEmail({
      to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: "type", value: "test" }],
    });

    if (!res.ok) return { ok: false, message: res.error ?? "Send failed" };
    return { ok: true, message: `Test email sent to ${to}`, id: res.id ?? null };
  });

/* ------------------------------------------------------------ email config */

/** Render one email template with realistic sample data, for admin preview. */
export const previewEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getEmailBrand, siteBaseUrl } = await import("@/lib/email/resend.server");
    const { siteName, logoUrl } = await getEmailBrand();
    const origin = siteBaseUrl();
    const tpls = await import("@/lib/email/templates");

    let built: { subject: string; html: string; text: string };
    switch (data.id) {
      case "order_receipt":
        built = tpls.orderReceiptEmail({
          siteName,
          logoUrl,
          customerName: "Rahim Ahmed",
          orderNo: 1042,
          productName: "Netflix Premium — 1 Month (Private)",
          quantity: 2,
          total: 9.98,
          paymentMethod: "binance",
          txid: "9f31c4ab72e5",
          trackUrl: `${origin}/track?order=1042&email=rahim%40example.com`,
        });
        break;
      case "admin_new_order":
        built = tpls.adminNewOrderEmail({
          siteName,
          logoUrl,
          orderNo: 1042,
          productName: "Netflix Premium — 1 Month (Private)",
          quantity: 2,
          total: 9.98,
          customerName: "Rahim Ahmed",
          customerEmail: "rahim@example.com",
          paymentMethod: "usdt_bep20",
          txid: "9f31c4ab72e5",
          adminUrl: `${origin}/admin/orders`,
        });
        break;
      case "account_verify":
        built = tpls.accountVerifyEmail({
          siteName,
          logoUrl,
          name: "Rahim Ahmed",
          verifyUrl: `${origin}/auth?token=sample-confirmation-link`,
          reseller: true,
        });
        break;
      case "reseller_application":
        built = tpls.resellerApplicationReceivedEmail({
          siteName,
          logoUrl,
          name: "Rahim Ahmed",
          email: "rahim@example.com",
          channel: "website",
          docsUrl: `${origin}/reseller/docs`,
        });
        break;
      case "admin_reseller_application":
        built = tpls.adminNewResellerApplicationEmail({
          siteName,
          logoUrl,
          name: "Rahim Ahmed",
          email: "rahim@example.com",
          telegram: "@rahim",
          website: "https://rahimshop.com",
          channel: "both",
          monthlyVolume: "200-500 orders",
          message: "I run a Telegram shop and want to resell your catalogue.",
          adminUrl: `${origin}/admin/resellers`,
        });
        break;
      case "reseller_approved":
        built = tpls.resellerApprovedEmail({
          siteName,
          logoUrl,
          name: "Rahim Ahmed",
          panelUrl: `${origin}/reseller/panel`,
          apiDocsUrl: `${origin}/reseller/docs`,
          signInUrl: `${origin}/auth?token=sample-sign-in-link`,
          tempPassword: "Qx7-tempPass-42",
        });
        break;
      case "test":
        built = tpls.testEmail({ siteName, logoUrl });
        break;
      default:
        throw new Error("Unknown email template");
    }

    // The real emails attach the logo as an inline cid image; browsers cannot
    // load cid:, so the preview swaps in the same logo as a data URI.
    const { EMAIL_LOGO_BASE64 } = await import("@/lib/email/logo-data");
    const { EMAIL_LOGO_SRC } = await import("@/lib/email/resend.server");
    const html = built.html.split(EMAIL_LOGO_SRC).join(`data:image/png;base64,${EMAIL_LOGO_BASE64}`);

    return { id: data.id, subject: built.subject, html, text: built.text };

  });


export const getEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getEmailConfig } = await import("@/lib/email/resend.server");
    const cfg = await getEmailConfig();
    return {
      apiKeyConfigured: cfg.apiKeyConfigured,
      from: cfg.from,
      fromName: cfg.fromName,
      fromAddress: cfg.fromAddress,
      replyTo: cfg.replyTo,
      notifyEmail: cfg.notifyEmail,
      toggles: cfg.toggles,
    };
  });

/* --------------------------------------------------------- support tickets */

export const listSupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const { data, error } = await sb
      .from("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSupportThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    await sb.from("support_tickets").update({ unread_admin: 0 }).eq("id", data.id);
    const [{ data: ticket }, { data: messages }] = await Promise.all([
      sb.from("support_tickets").select("*").eq("id", data.id).maybeSingle(),
      sb.from("support_messages").select("*").eq("ticket_id", data.id).order("created_at", { ascending: true }),
    ]);
    return { ticket, messages: messages ?? [] };
  });

export const replySupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; body: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const body = String(data.body ?? "").trim();
    if (!body) throw new Error("Message is empty");
    const { postTicketReply } = await import("@/lib/bot/engine.server");
    await postTicketReply(data.id, "admin", body, "Support");
    return { ok: true };
  });

export const closeSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "open" | "closed" }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { setTicketStatus } = await import("@/lib/bot/engine.server");
    await setTicketStatus(data.id, data.status, "admin");
    return { ok: true };
  });
