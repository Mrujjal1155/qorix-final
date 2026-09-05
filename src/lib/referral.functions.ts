import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Website (non-Telegram) referral programme. */

export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profile }, { data: txs }, { data: setting }, { count: refCount }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("ref_code,referred_by,wallet_balance,referral_earnings,referral_count")
        .eq("id", context.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("wallet_transactions")
        .select("id,type,amount,balance_after,reference,note,created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.from("bot_settings").select("value").eq("key", "web_referral_percent").maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("referred_by", context.userId),
    ]);

    const percent = Number((setting as any)?.value ?? 2) || 2;
    return {
      ref_code: (profile as any)?.ref_code ?? "",
      referred_by: (profile as any)?.referred_by ?? null,
      wallet_balance: Number((profile as any)?.wallet_balance ?? 0),
      referral_earnings: Number((profile as any)?.referral_earnings ?? 0),
      referral_count: refCount ?? Number((profile as any)?.referral_count ?? 0),
      percent,
      transactions: (txs ?? []) as any[],
    };
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
