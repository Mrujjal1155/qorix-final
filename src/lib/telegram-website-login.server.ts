import type { SupabaseClient } from "@supabase/supabase-js";
import { loginCodeAvailable, telegramWebsiteLoginUrl } from "./telegram-website-login";

const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, "0")).join("");
export async function telegramLoginHash(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/** Called only for a verified private-chat sender. No username lookup grants access. */
export async function issueTelegramWebsiteLogin(db: SupabaseClient, telegramId: number, site: string, destination: "/" | "/account" = "/") {
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) throw new Error("Invalid Telegram account");
  const { data: user, error: readError } = await db.from("bot_users").select("telegram_id,is_banned").eq("telegram_id", telegramId).maybeSingle();
  if (readError || !user || user.is_banned) throw new Error("Telegram account unavailable");
  const code = randomHex(12);
  const secret = randomHex(24);
  const url = telegramWebsiteLoginUrl(site, code, secret, destination);
  const now = new Date();
  const { error } = await db.from("web_login_codes").insert({
    code, secret_hash: await telegramLoginHash(secret), telegram_id: telegramId,
    confirmed_at: now.toISOString(), expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error("Could not prepare website login");
  return url;
}

/** Credential-authorized preview reveals only the display name, never wallet or orders. */
export async function previewTelegramWebsiteLogin(db: SupabaseClient, credentials: { code: string; secret: string }) {
  const { data: row, error } = await db.from("web_login_codes")
    .select("telegram_id,confirmed_at,claimed_at,expires_at")
    .eq("code", credentials.code).eq("secret_hash", await telegramLoginHash(credentials.secret)).maybeSingle();
  if (error || !row || !loginCodeAvailable(row)) return { status: "invalid" as const };
  const { data: user, error: userError } = await db.from("bot_users")
    .select("username,first_name,is_banned").eq("telegram_id", row.telegram_id).maybeSingle();
  if (userError || !user || user.is_banned) return { status: "invalid" as const };
  return { status: "ok" as const, name: user.username ? `@${user.username}` : user.first_name || "Telegram account" };
}