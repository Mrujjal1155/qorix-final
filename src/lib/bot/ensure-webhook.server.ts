// Self-healing Telegram webhook registration.
//
// The bot only receives updates while Telegram has our endpoint registered.
// Instead of relying on someone pressing a button in the admin panel, we check
// (and repair) the registration automatically: once per worker instance on the
// first request to the live domain, and on demand via
// /api/public/telegram/register.

import { createHash } from "crypto";
import { getMe, getWebhookInfo, setWebhook, setMyCommands } from "@/lib/telegram.server";
import { PRODUCTION_SITE_URL, canonicalOrigin } from "@/lib/site-url";

function botKey() {
  return process.env["TELEGRAM_BOT_TOKEN"] || process.env["TELEGRAM_API_KEY"];
}

function secretFor(key: string) {
  return (
    process.env["TELEGRAM_WEBHOOK_SECRET"] ||
    createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url")
  );
}

export type EnsureResult = {
  ok: boolean;
  registered: boolean;
  url?: string;
  current?: string;
  bot?: { id: number | null; username: string | null };
  pendingUpdates?: number;
  lastError?: string | null;
  message?: string;
};

/** Register the webhook when it is missing or pointing somewhere else. */
export async function ensureWebhook(origin?: string, force = false): Promise<EnsureResult> {
  const key = botKey();
  if (!key) return { ok: false, registered: false, message: "Bot token is not configured" };

  // Never register a preview/published Lovable subdomain: the bot must always
  // talk to the main domain.
  const base = canonicalOrigin(origin ?? process.env["SITE_URL"] ?? PRODUCTION_SITE_URL);
  const url = `${base}/api/public/telegram/webhook`;

  const [info, me] = await Promise.all([getWebhookInfo(), getMe()]);
  const current = (info.result?.url as string | undefined) ?? "";
  const diagnostic = {
    bot: {
      id: typeof me.result?.id === "number" ? me.result.id : null,
      username: typeof me.result?.username === "string" ? me.result.username : null,
    },
    pendingUpdates: Number(info.result?.pending_update_count ?? 0),
    lastError: (info.result?.last_error_message as string | undefined) ?? null,
  };
  if (!force && current === url && !info.result?.last_error_message) {
    return { ok: true, registered: false, url, current, ...diagnostic };
  }

  const res = await setWebhook(url, secretFor(key));
  if (res.ok) {
    // Keep the command menu in sync at the same time (cheap, idempotent).
    await setMyCommands().catch(() => {});
  }
  return {
    ok: Boolean(res.ok),
    registered: Boolean(res.ok),
    url,
    current,
    ...diagnostic,
    message: res.ok ? `Webhook registered: ${url}` : (res.description ?? "Registration failed"),
  };
}

let checked = false;

/**
 * Fire-and-forget guard used by the server entry; runs at most once per
 * instance. Always use the configured/canonical production URL here. Passing
 * the request origin would let a preview visit replace the live bot webhook.
 */
export function ensureWebhookOnce() {
  if (checked) return;
  checked = true;
  ensureWebhook().catch((error) => console.error("Webhook auto-register failed:", error));
}
