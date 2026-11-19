import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Website Deposit page: the signed-in user's connected bot wallet. */
async function linkedTelegram(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("profiles").select("telegram_id").eq("id", userId).maybeSingle();
  const tid = (data as any)?.telegram_id;
  return { db: supabaseAdmin, tid: tid ? Number(tid) : null };
}

export const getWebWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, tid } = await linkedTelegram(context.userId);
    const { data: bs } = await db.from("bot_settings").select("value").eq("key", "bot_username").maybeSingle();
    const botUser = String((bs as any)?.value ?? "").replace(/^@/, "");
    if (!tid) return { linked: false as const, botUser };
    const [{ data: u }, { data: tx }] = await Promise.all([
      db.from("bot_users").select("balance,total_spent,membership,username,is_banned").eq("telegram_id", tid).maybeSingle(),
      db.from("transactions").select("id,type,amount,method,status,created_at").eq("telegram_id", tid).order("created_at", { ascending: false }).limit(20),
    ]);
    return {
      linked: true as const, botUser,
      username: (u as any)?.username ?? null,
      banned: Boolean((u as any)?.is_banned),
      balance: Number((u as any)?.balance ?? 0),
      total_spent: Number((u as any)?.total_spent ?? 0),
      membership: String((u as any)?.membership ?? "—"),
      history: ((tx ?? []) as any[]).map((t) => ({ id: String(t.id), type: String(t.type), amount: Number(t.amount), method: t.method ?? null, status: String(t.status), created_at: String(t.created_at) })),
    };
  });

export const purchaseWithWebWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(100000), request_id: z.string().uuid(), expected_total: z.number().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, tid } = await linkedTelegram(context.userId);
    if (!tid) throw new Error("Connect your Telegram account first.");
    const { data: user } = await db.from("bot_users").select("is_banned").eq("telegram_id", tid).maybeSingle();
    if (!user || user.is_banned) throw new Error("This wallet is unavailable.");
    const { data: existing } = await db.from("orders").select("product_id,quantity,order_no,customer_email")
      .eq("user_id", context.userId).eq("payment_method", "wallet").eq("meta->>wallet_request_id", data.request_id).maybeSingle();
    if (existing) {
      if (existing.product_id !== data.product_id || existing.quantity !== data.quantity) throw new Error("Request already used");
      const email = String(existing.customer_email ?? "");
      const { orderAccessToken } = await import("@/lib/order-access.server");
      return { order_no: existing.order_no, email, token: orderAccessToken(existing.order_no, email) };
    }
    const { data: product } = await db.from("products").select("id,delivery_type,supplier_id,supplier_external_id,is_active").eq("id", data.product_id).maybeSingle();
    if (!product?.is_active) throw new Error("Product unavailable.");
    if (product.delivery_type !== "manual" && product.supplier_id && product.supplier_external_id) {
      const { data: supplier } = await db.from("suppliers").select("*").eq("id", product.supplier_id).eq("is_enabled", true).maybeSingle();
      if (!supplier) throw new Error("Product unavailable.");
      const { supplierProducts } = await import("@/lib/suppliers/api.server");
      let available = 0;
      try { available = Number((await supplierProducts(supplier as any)).find(p => String(p.external_id) === String(product.supplier_external_id))?.stock ?? 0); }
      catch { throw new Error("Live stock could not be verified. Please try again shortly."); }
      if (available < data.quantity) throw new Error("Not enough stock is available.");
    }
    const { data: result, error } = await db.rpc("purchase_website_wallet", { _user_id: context.userId, _product_id: data.product_id, _qty: data.quantity, _request_id: data.request_id, _expected_total: data.expected_total });
    if (error) {
      const safe = ["Insufficient wallet balance", "Stock unavailable", "Price changed. Refresh checkout", "Request already used", "Wallet unavailable"];
      throw new Error(safe.includes(error.message) ? error.message : "Could not place the wallet order. Please try again with the same checkout.");
    }
    const r = result as { id: string; order_no: number; email: string; changed: boolean };
    if (r.changed) {
      const { deliverWebsiteWalletOrder } = await import("@/lib/website-wallet.server");
      await deliverWebsiteWalletOrder(r.id);
    }
    const { orderAccessToken } = await import("@/lib/order-access.server");
    return { order_no: r.order_no, email: r.email, token: orderAccessToken(r.order_no, r.email) };
  });

export const createWebLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabaseAdmin.from("web_link_codes" as any).insert({ code, user_id: context.userId });
    if (error) throw new Error("Could not create a connect link. Please try again.");
    return { code };
  });

export const unlinkWebTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ telegram_id: null }).eq("id", context.userId);
    return { ok: true };
  });

const GATEWAYS = ["payid", "bybit", "chain_trc20", "chain_bep20", "usdt_trc20", "usdt_bep20", "eps_mfs", "eps_card", "oxapay"] as const;

export const startWebDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gw: string; amount: number }) => {
    const gw = GATEWAYS.find((g) => g === d.gw);
    const amount = Math.round(Number(d.amount) * 100) / 100;
    if (!gw) throw new Error("Unknown payment method.");
    if (!(amount > 0 && amount <= 10000)) throw new Error("Enter a valid amount.");
    return { gw, amount };
  })
  .handler(async ({ data, context }) => {
    const { db, tid } = await linkedTelegram(context.userId);
    if (!tid) return { error: "Connect your Telegram wallet first." };
    const { data: u } = await db.from("bot_users").select("is_banned").eq("telegram_id", tid).maybeSingle();
    if (!u || (u as any).is_banned) return { error: "This wallet is not available." };
    const { webStartDeposit } = await import("@/lib/bot/engine.server");
    return await webStartDeposit(tid, data.gw, data.amount);
  });

export const submitWebDepositTxid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; txid: string }) => ({ id: String(d.id ?? "").slice(0, 64), txid: String(d.txid ?? "").trim().slice(0, 128) }))
  .handler(async ({ data, context }) => {
    const { tid } = await linkedTelegram(context.userId);
    if (!tid) return { message: "Connect your Telegram wallet first.", credited: false };
    const { webSubmitDepositTxid } = await import("@/lib/bot/engine.server");
    return await webSubmitDepositTxid(tid, data.id, data.txid);
  });

export const getWebDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id ?? "").slice(0, 64) }))
  .handler(async ({ data, context }) => {
    const { db, tid } = await linkedTelegram(context.userId);
    if (!tid) return { status: "unknown" };
    const { data: row } = await db.from("binance_deposits").select("status,expires_at").eq("id", data.id).eq("telegram_id", tid).maybeSingle();
    return { status: String((row as any)?.status ?? "unknown"), expires_at: (row as any)?.expires_at ?? null };
  });

/** Website Profile page = the bot PROFILE (account, wallet, referrals) for the connected Telegram user. */
export const getWebProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, tid } = await linkedTelegram(context.userId);
    if (!tid) return { linked: false as const };
    const [{ data: u }, { count }, { data: bs }] = await Promise.all([
      db.from("bot_users").select("username,first_name,membership,created_at,balance,total_spent,referral_count,referral_earnings,ref_code").eq("telegram_id", tid).maybeSingle(),
      db.from("orders").select("id", { count: "exact", head: true }).eq("telegram_id", tid),
      db.from("bot_settings").select("value").eq("key", "bot_username").maybeSingle(),
    ]);
    const r = (u ?? {}) as any;
    const bot = String((bs as any)?.value ?? "").replace(/^@/, "");
    return {
      linked: true as const,
      telegram_id: tid,
      username: r.username ? `@${r.username}` : (r.first_name ?? "—"),
      membership: String(r.membership ?? "—"),
      orders: count ?? 0,
      member_since: r.created_at ?? null,
      balance: Number(r.balance ?? 0),
      total_spent: Number(r.total_spent ?? 0),
      referrals: Number(r.referral_count ?? 0),
      referral_earnings: Number(r.referral_earnings ?? 0),
      referral_link: r.ref_code && bot ? `https://t.me/${bot}?start=ref_${r.ref_code}` : null,
    };
  });

/* Support / Referral Store pages (Mobile View) — same data and actions as the bot. */
export const getWebSupport = createServerFn({ method: "GET" }).handler(async () => {
  const { webSupportInfo } = await import("@/lib/bot/engine.server");
  return await webSupportInfo();
});

export const getWebTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tid } = await linkedTelegram(context.userId);
    if (!tid) return { linked: false as const, tickets: [] };
    const { webTickets } = await import("@/lib/bot/engine.server");
    return { linked: true as const, tickets: await webTickets(tid) };
  });

export const getWebTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "").slice(0, 64) }))
  .handler(async ({ data, context }) => {
    const { tid } = await linkedTelegram(context.userId);
    if (!tid) return null;
    const { webTicketMessages } = await import("@/lib/bot/engine.server");
    return await webTicketMessages(tid, data.id);
  });

const cleanBody = (v: unknown) => {
  const b = String(v ?? "").trim().slice(0, 2000);
  if (b.length < 3) throw new Error("Please write a little more about your issue.");
  return b;
};

export const createWebTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { body: string }) => ({ body: cleanBody(d?.body) }))
  .handler(async ({ data, context }) => {
    const { tid } = await linkedTelegram(context.userId);
    if (!tid) return { error: "Connect your Telegram account first." };
    const { webCreateTicket } = await import("@/lib/bot/engine.server");
    const t = await webCreateTicket(tid, data.body);
    return t ? { ticket: t } : { error: "Could not create the ticket. Please try again." };
  });

export const replyWebTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; body: string }) => ({ id: String(d?.id ?? "").slice(0, 64), body: cleanBody(d?.body) }))
  .handler(async ({ data, context }) => {
    const { tid } = await linkedTelegram(context.userId);
    if (!tid) return { ok: false };
    const { webReplyTicket } = await import("@/lib/bot/engine.server");
    return { ok: await webReplyTicket(tid, data.id, data.body) };
  });

export const getWebReferralStore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tid } = await linkedTelegram(context.userId);
    if (!tid) return null;
    const { webReferralStore } = await import("@/lib/bot/engine.server");
    return await webReferralStore(tid);
  });

export const claimWebReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "").slice(0, 64) }))
  .handler(async ({ data, context }) => {
    const { tid } = await linkedTelegram(context.userId);
    if (!tid) return { ok: false, message: "Connect your Telegram account first." };
    const { webClaimReward } = await import("@/lib/bot/engine.server");
    return await webClaimReward(tid, data.id);
  });
