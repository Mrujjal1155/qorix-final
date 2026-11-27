import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Website copy of the bot's Reseller API panel, for the signed-in user's reseller account (same rows the bot edits). */
async function ctx(userId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: prof } = await db.from("profiles").select("telegram_id,email").eq("id", userId).maybeSingle();
  const tid = prof?.telegram_id ? Number(prof.telegram_id) : null;
  let r: any = null;
  if (tid) r = (await db.from("resellers").select("*").eq("telegram_id", tid).maybeSingle()).data;
  if (!r) r = (await db.from("resellers").select("*").eq("user_id", userId).maybeSingle()).data;
  return { db, tid, r };
}
const mask = (k: string) => (k.length > 12 ? `${k.slice(0, 8)}…${k.slice(-4)}` : k);
const newKey = () => "qxr_" + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");

export const getApiBanner = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db.from("bot_settings").select("value").eq("key", "api_banner_url").maybeSingle();
  const v = String(data?.value ?? "").trim();
  return { banner: /^https:\/\/\S+$/.test(v) ? v : null };
});

export const getWebApiPanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, tid, r } = await ctx(context.userId);
    if (!r) return { account: null, canCreate: Boolean(tid) };
    const { data: rows, count } = await db.from("orders").select("total", { count: "exact" }).eq("reseller_id", r.id).limit(100000);
    const spent = (rows ?? []).reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);
    return {
      canCreate: false,
      account: {
        name: String(r.name), no: r.account_no ?? null, active: Boolean(r.is_active), balance: Number(r.balance ?? 0),
        discount: Number(r.discount_percent ?? 0), orders: count ?? 0, spent, keyMasked: mask(String(r.api_key ?? "")), alert: Number(r.low_bal_alert ?? 0),
      },
    };
  });

export const webApiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { action: string; amount?: number }) => {
    const action = ["create", "regen", "revoke", "alert", "key"].find((a) => a === d.action);
    if (!action) throw new Error("Unknown action");
    return { action, amount: Math.max(0, Math.min(100000, Math.round(Number(d.amount ?? 0) * 100) / 100 || 0)) };
  })
  .handler(async ({ data, context }) => {
    const { db, tid, r } = await ctx(context.userId);
    if (data.action === "create") {
      if (r) return { ok: true };
      if (!tid) throw new Error("Connect Telegram first to open an API account.");
      const { data: u } = await db.from("bot_users").select("first_name,last_name,username,is_banned").eq("telegram_id", tid).maybeSingle();
      if (!u || u.is_banned) throw new Error("This account cannot open an API account.");
      const { data: s } = await db.from("bot_settings").select("value").eq("key", "reseller_default_discount").maybeSingle();
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || (u.username ? `@${u.username}` : `TG ${tid}`);
      const { error } = await db.from("resellers").insert({ name, telegram_id: tid, api_key: newKey(), discount_percent: Math.max(0, Math.min(90, Number(s?.value ?? 0) || 0)), allow_bot: true, allow_website: true, is_active: true, notes: "Created from the website" });
      if (error) throw new Error("Could not create the account.");
      return { ok: true };
    }
    if (!r) throw new Error("Open your API account first.");
    if (data.action === "key") return { ok: true, key: String(r.api_key) };
    if (data.action === "regen") {
      const key = newKey();
      await db.from("resellers").update({ api_key: key }).eq("id", r.id);
      return { ok: true, key };
    }
    if (data.action === "revoke") { await db.from("resellers").update({ is_active: !r.is_active }).eq("id", r.id); return { ok: true }; }
    await db.from("resellers").update({ low_bal_alert: data.amount }).eq("id", r.id);
    return { ok: true };
  });

export const getWebApiPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, r } = await ctx(context.userId);
    if (!r) return { discount: 0, rows: [] as { name: string; retail: number; yours: number }[] };
    const { data: prods } = await db.from("products").select("id,name,price,api_price,flash_ends_at,flash_discount,supplier_id,delivery_type")
      .eq("is_active", true).is("owner_reseller_id", null).order("sort_order").limit(20);
    const { apiUnitPrice } = await import("@/lib/reseller/core.server");
    return { discount: Number(r.discount_percent ?? 0), rows: (prods ?? []).map((p: any) => ({ name: String(p.name), retail: Number(p.price ?? 0), yours: Number(apiUnitPrice(p, r)) })) };
  });

export const getWebApiOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, r } = await ctx(context.userId);
    if (!r) return [];
    const { data } = await db.from("orders").select("order_no,product_name,quantity,total,status,created_at").eq("reseller_id", r.id).order("created_at", { ascending: false }).limit(10);
    return (data ?? []).map((o: any) => ({ no: Number(o.order_no), name: String(o.product_name), qty: Number(o.quantity), total: Number(o.total), status: String(o.status), at: String(o.created_at) }));
  });
