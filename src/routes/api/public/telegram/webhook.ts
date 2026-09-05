import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

export function deriveTelegramWebhookSecret(key: string): string {
  return createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["TELEGRAM_BOT_TOKEN"] || process.env["TELEGRAM_API_KEY"];
        if (!key) return new Response("Bot not configured", { status: 503 });

        // Accept either the manually configured secret (Cloudflare env) or the
        // derived one, so a webhook registered by hand keeps working.
        const accepted = [process.env["TELEGRAM_WEBHOOK_SECRET"], deriveTelegramWebhookSecret(key)].filter(
          (s): s is string => Boolean(s),
        );
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!accepted.some((s) => safeEqual(actual, s)))
          return new Response("Unauthorized", { status: 401 });

        let update: any;
        try {
          update = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        // Status bookkeeping runs alongside the actual handling (never before it).
        const track = (async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const from =
            update.message?.from ?? update.edited_message?.from ?? update.callback_query?.from;
          const kind = update.callback_query
            ? "callback_query"
            : update.edited_message
              ? "edited_message"
              : update.message
                ? "message"
                : "other";
          await (supabaseAdmin as any).from("bot_settings").upsert(
            [
              { key: "webhook_last_update_at", value: new Date().toISOString() },
              { key: "webhook_last_update_kind", value: kind },
              {
                key: "webhook_last_update_from",
                value: String(from?.username ? "@" + from.username : (from?.id ?? "unknown")),
              },
            ],
            { onConflict: "key" },
          );
        })().catch((error) => console.error("Webhook status tracking failed:", error));

        const handle = (async () => {
          const { handleUpdate } = await import("@/lib/bot/engine.server");
          await handleUpdate(update);
        })().catch((error) =>
          console.error(`Telegram update failed [update_id=${String(update.update_id ?? "unknown")}]:`, error),
        );

        // Keep supplier catalogues fresh (throttled to once every 10 minutes)
        // so new stock lands in the shop and the channel automatically.
        const autoSync = (async () => {
          const { maybeAutoSyncSuppliers } = await import("@/lib/suppliers/sync.server");
          await maybeAutoSyncSuppliers();
        })().catch((error) => console.error("Supplier auto-sync failed:", error));
        void autoSync;

        await Promise.allSettled([handle, track]);
        return Response.json({ ok: true });
      },
    },
  },
});
