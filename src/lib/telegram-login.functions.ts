import { createServerFn } from "@tanstack/react-start";

/**
 * Website "Connect Telegram" login. The browser keeps a private secret; only its hash is stored.
 * The public code travels through the bot deep link (/start wlg_<code>); the bot confirms it.
 * Claiming needs both code + secret, works once, and signs the browser into the website account
 * tied to that Telegram ID (created on first login), so wallet/orders are read from the bot user.
 */
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const startTelegramLogin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const code = hex(12);
  const secret = hex(24);
  const { error } = await supabaseAdmin.from("web_login_codes" as any).insert({ code, secret_hash: await sha256(secret) });
  if (error) throw new Error("Could not start Telegram login. Please try again.");
  const { data: bs } = await supabaseAdmin.from("bot_settings").select("value").eq("key", "bot_username").maybeSingle();
  const botUser = String((bs as any)?.value ?? "").replace(/^@/, "");
  return { code, secret, botUser };
});

export const claimTelegramLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; secret: string }) => ({
    code: String(d?.code ?? "").replace(/[^a-f0-9]/g, "").slice(0, 40),
    secret: String(d?.secret ?? "").replace(/[^a-f0-9]/g, "").slice(0, 64),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: row } = await db.from("web_login_codes" as any).select("confirmed_at,expires_at").eq("code", data.code).maybeSingle();
    if (!row) return { status: "invalid" as const };
    if (!(row as any).confirmed_at) return { status: new Date((row as any).expires_at) < new Date() ? "expired" as const : "waiting" as const };

    const { data: tidRaw } = await db.rpc("claim_web_login_code" as any, { _code: data.code, _secret_hash: await sha256(data.secret) });
    const tid = tidRaw ? Number(tidRaw) : null;
    if (!tid) return { status: "invalid" as const };
    const { data: bu } = await db.from("bot_users").select("is_banned").eq("telegram_id", tid).maybeSingle();
    if (!bu || (bu as any).is_banned) return { status: "unavailable" as const };

    // Existing website account linked to this Telegram ID, or a new one.
    let email: string | null = null;
    const { data: prof } = await db.from("profiles").select("id").eq("telegram_id", tid).maybeSingle();
    if (prof) {
      const { data: u } = await db.auth.admin.getUserById((prof as any).id);
      email = u?.user?.email ?? null;
    } else {
      email = `tg${tid}@telegram.qorixlab.com`;
      const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { telegram_id: tid, full_name: `Telegram ${tid}` } });
      let uid = created?.user?.id;
      if (error || !uid) {
        // Account may exist from an earlier interrupted login.
        const { data: list } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
        uid = (list as any)?.id;
        if (!uid) return { status: "error" as const };
      }
      await db.from("profiles").upsert({ id: uid, email, telegram_id: tid } as any, { onConflict: "id" });
    }
    if (!email) return { status: "error" as const };
    const { data: link, error: le } = await db.auth.admin.generateLink({ type: "magiclink", email });
    const token_hash = link?.properties?.hashed_token;
    if (le || !token_hash) return { status: "error" as const };
    return { status: "ok" as const, token_hash };
  });
