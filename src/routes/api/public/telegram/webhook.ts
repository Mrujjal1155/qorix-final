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

let lastTrackAt = 0;

/** Coarse handler label only (command or callback prefix) — never text, IDs or user data. */
function commandLabel(update: any): string {
  const data = update.callback_query?.data;
  if (typeof data === "string") return "cb:" + (data.split(/[:_|]/)[0] ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 16);
  const text = (update.message ?? update.edited_message)?.text;
  if (typeof text === "string" && text.startsWith("/"))
    return "cmd:" + (text.slice(1).split(/[\s@]/)[0] ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 16);
  if (update.my_chat_member) return "member";
  return update.callback_query ? "cb" : "msg";
}

const durations = new Map<string, number[]>();
let durationCount = 0;
function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}
/** Per-isolate rolling timings; logs p50/p95 per label every 50 updates. */
function recordDuration(label: string, ms: number) {
  const list = durations.get(label) ?? [];
  list.push(ms);
  if (list.length > 200) list.shift();
  durations.set(label, list);
  if (++durationCount % 50 !== 0) return;
  const report = [...durations.entries()].map(([k, v]) => {
    const s = [...v].sort((a, b) => a - b);
    return `${k} n=${s.length} p50=${pct(s, 0.5)}ms p95=${pct(s, 0.95)}ms`;
  });
  console.log("[bot-timing]", report.join(" | "));
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
        // Status heartbeat: at most one write per 30s per worker, not one per click.
        const nowMs = Date.now();
        const skipTrack = nowMs - lastTrackAt < 30_000;
        if (!skipTrack) lastTrackAt = nowMs;
        const track = (async () => {
          if (skipTrack) return;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const from =
            update.message?.from ?? update.edited_message?.from ?? update.callback_query?.from ?? update.my_chat_member?.from;
          const kind = update.my_chat_member ? "my_chat_member" : update.callback_query
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
          const started = Date.now();
          const { handleUpdate } = await import("@/lib/bot/engine.server");
          try {
            await handleUpdate(update);
          } finally {
            recordDuration(commandLabel(update), Date.now() - started);
          }
        })().catch((error) =>
          console.error(`Telegram update failed [update_id=${String(update.update_id ?? "unknown")}]:`, error),
        );

        // Keep supplier catalogues fresh without spending this request's CPU
        // budget on it — the sync runs in its own worker invocation.
        try {
          const { kickSupplierSync } = await import("@/lib/suppliers/kick.server");
          kickSupplierSync();
        } catch (error) {
          console.error("Supplier auto-sync ping failed:", error);
        }

        // Telegram delivers updates in order and retries one that times out, so a
        // single hung update would block every later click. Answer within 25s.
        await Promise.race([
          Promise.allSettled([handle, track]),
          new Promise((resolve) => setTimeout(resolve, 25_000)),
        ]);
        return Response.json({ ok: true });
      },
    },
  },
});
