import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
