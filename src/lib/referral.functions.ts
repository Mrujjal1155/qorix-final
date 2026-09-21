import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Website (non-Telegram) referral programme. */

export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profile }, { data: txs }, { data: settings }, { count: refCount }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("ref_code,referred_by,wallet_balance,referral_earnings,referral_count,telegram_id,is_banned")
        .eq("id", context.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("wallet_transactions")
        .select("id,type,amount,balance_after,reference,note,created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("bot_settings")
        .select("key,value")
        .in("key", ["referral_percent", "web_referral_percent", "referral_min_order", "referral_max_commission"]),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("referred_by", context.userId),
    ]);

    const map: Record<string, string> = {};
    for (const row of (settings ?? []) as any[]) map[row.key] = row.value ?? "";
    const percent = Number(map["referral_percent"] || map["web_referral_percent"] || 2) || 2;

    // A linked Telegram account earns into this same wallet, so show it as one balance.
    const telegramId = (profile as any)?.telegram_id ?? null;
    let telegramReferrals = 0;
    if (telegramId) {
      const { count } = await supabaseAdmin
        .from("bot_users")
        .select("telegram_id", { count: "exact", head: true })
        .eq("referred_by", telegramId);
      telegramReferrals = count ?? 0;
    }

    return {
      ref_code: (profile as any)?.ref_code ?? "",
      referred_by: (profile as any)?.referred_by ?? null,
      wallet_balance: Number((profile as any)?.wallet_balance ?? 0),
      referral_earnings: Number((profile as any)?.referral_earnings ?? 0),
      referral_count: (refCount ?? Number((profile as any)?.referral_count ?? 0)) + telegramReferrals,
      percent,
      min_order: Number(map["referral_min_order"] || 0) || 0,
      max_commission: Number(map["referral_max_commission"] || 0) || 0,
      telegram_id: telegramId ? String(telegramId) : null,
      telegram_referrals: telegramReferrals,
      transactions: (txs ?? []) as any[],
    };
  });

/** Link the Telegram bot account that owns `code` so both channels share one wallet. */
export const linkTelegramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => ({ code: String(d.code ?? "").trim().toUpperCase().slice(0, 16) }))
  .handler(async ({ data, context }) => {
    if (!data.code) return { ok: false, reason: "empty" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: botUser } = await supabaseAdmin
      .from("bot_users")
      .select("telegram_id,is_banned")
      .ilike("ref_code", data.code)
      .maybeSingle();
    if (!botUser) return { ok: false, reason: "invalid" as const };
    if ((botUser as any).is_banned) return { ok: false, reason: "banned" as const };

    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("telegram_id", (botUser as any).telegram_id)
      .maybeSingle();
    if (taken && (taken as any).id !== context.userId) return { ok: false, reason: "taken" as const };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ telegram_id: (botUser as any).telegram_id })
      .eq("id", context.userId);
    if (error) return { ok: false, reason: "failed" as const };
    return { ok: true as const, telegram_id: String((botUser as any).telegram_id) };
  });

/** Attach the signed-in account to the referrer that owns `code` (one time only). */
export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => ({ code: String(d.code ?? "").trim().toUpperCase().slice(0, 16) }))
  .handler(async ({ data, context }) => {
    if (!data.code) return { ok: false, reason: "empty" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id,ref_code,referred_by")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me) return { ok: false, reason: "no_profile" as const };
    if ((me as any).referred_by) return { ok: false, reason: "already" as const };
    if (String((me as any).ref_code ?? "").toUpperCase() === data.code) return { ok: false, reason: "self" as const };

    const { data: referrer } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("ref_code", data.code)
      .maybeSingle();
    if (!referrer) return { ok: false, reason: "invalid" as const };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ referred_by: (referrer as any).id })
      .eq("id", context.userId)
      .is("referred_by", null);
    if (error) return { ok: false, reason: "failed" as const };

    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", (referrer as any).id);
    await supabaseAdmin.from("profiles").update({ referral_count: count ?? 0 }).eq("id", (referrer as any).id);

    return { ok: true as const };
  });
