import { parseNotifyMatrix, stockKindToNotify } from "@/lib/telegram-notify-routes";
import { sendAlertMessage } from "@/lib/telegram.server";
import { sendAdminBroadcast } from "@/lib/bot/admin-broadcast.server";

export const STOCK_AUDIENCE_CONCURRENCY = 6;
// Six starts per 200 ms targets Telegram's free ceiling of 30 starts/second.
// Slow responses, other bot traffic and flood control can reduce actual delivery.
export const STOCK_AUDIENCE_WAVE_MS = 200;
// Lease is 15s; leave ~2s for in-flight sends and the final batched checkpoint.
export const STOCK_AUDIENCE_BUDGET_MS = 12_500;
/** Results are written in batches: Workers allow only 6 open connections per
 * invocation, so a per-recipient DB write halves the Telegram send rate. */
export const STOCK_AUDIENCE_CHECKPOINT_BATCH = 30;
export const DEFAULT_ALERT_RATE_PER_MINUTE = 1500;
export const MAX_ALERT_RATE_PER_MINUTE = 1800; // Telegram free ceiling: 30/s
export const MAX_FLOOD_WAITS_PER_RUN = 3;
const MAX_INFLIGHT_WAVES = 8;

/** Wave spacing from the admin rate; invalid values fall back to the default. */
export function alertWaveMs(ratePerMinute: unknown) {
  const n = Number(ratePerMinute);
  const rate = Number.isFinite(n) && n > 0 ? Math.min(MAX_ALERT_RATE_PER_MINUTE, Math.max(60, n)) : DEFAULT_ALERT_RATE_PER_MINUTE;
  return Math.round((STOCK_AUDIENCE_CONCURRENCY * 60_000) / rate);
}

async function readSettings(db: any): Promise<Record<string, any>> {
  try {
    const { data } = await db.from("bot_settings").select("key,value")
      .in("key", ["notify_routes", "alert_send_rate_per_minute", "alert_sending_paused"]);
    return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  } catch { return {}; }
}

/** A shared database lease prevents overlapping ticks from multiplying broadcasts. */
export async function drainStockAudience(db: any, runtime = {
  now: () => Date.now(),
  wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}) {
  const started = runtime.now();
  const settings = await readSettings(db);
  if (String(settings["alert_sending_paused"] ?? "") === "true") return { sent: 0, retry: 0, paused: true };
  const waveMs = alertWaveMs(settings["alert_send_rate_per_minute"]);
  const { data: rows, error } = await db.rpc("claim_stock_notification_recipients_fast");
  if (error) throw new Error(`Customer notification claim failed: ${error.message}`);
  let sent = 0;
  let retry = 0;
  let recipients = rows ?? [];
  // Admin matrix: stock DMs whose "Bot DM" switch is off are cancelled, never sent.
  const matrix = parseNotifyMatrix(settings["notify_routes"] ?? null);
  if (matrix) {
    const keep: any[] = [];
    for (const row of recipients) {
      const nk = Number(row.telegram_id) > 0 ? stockKindToNotify(String(row.message?.kind ?? "")) : null;
      if (nk && !matrix.dm[nk]) {
        await db.from("stock_notification_recipients").update({ status: "cancelled", claimed_at: null, last_error: "Bot DM off in Telegram Notifications" })
          .eq("event_id", row.event_id).eq("telegram_id", row.telegram_id).eq("status", "sending");
      } else keep.push(row);
    }
    recipients = keep;
  }
  let offset = 0;
  let floodWaits = 0;
  const inflight = new Set<Promise<void>>();
  let failure: unknown = null;
  let pending: any[] = [];
  const flush = async () => {
    if (!pending.length) return;
    const batch = pending; pending = [];
    const { error: saveError } = await db.rpc("checkpoint_stock_notification_recipients", { _rows: batch });
    if (saveError) throw new Error(`Customer delivery checkpoint failed: ${saveError.message}`);
  };
  // Waves start on a fixed cadence and overlap, so slow Telegram replies no longer
  // stretch each wave to ~1s; each wave still rechecks its own claims first.
  const runWave = async (wave: any[]) => {
    const { data: active, error: activeError } = await db.rpc("active_stock_notification_claims", {
      _event_ids: wave.map((row: any) => row.event_id), _telegram_ids: wave.map((row: any) => row.telegram_id),
    });
    if (activeError) throw new Error("Customer notification cancellation check failed");
    const allowed = new Set((active ?? []).map((row: any) => `${row.event_id}:${row.telegram_id}`));
    await Promise.all(wave.filter((row: any) => allowed.has(`${row.event_id}:${row.telegram_id}`)).map(async (row: any) => {
    let result;
    try {
      result = row.message.kind === "broadcast"
        ? await sendAdminBroadcast(row.telegram_id, row.message)
        : await sendAlertMessage(row.telegram_id, row.message.text, row.message.keyboard);
    } catch (error) {
      result = { ok: false, description: error instanceof Error ? error.message : "Send interrupted" };
    }
    const terminal = /bot was blocked|user is deactivated|chat not found/i.test(result.description ?? "");
    const floodWait = Number(result.parameters?.retry_after ?? 0);
    if (!result.ok && floodWait > 0) floodWaits += 1;
    // Honour Telegram's exact flood wait; other temporary failures wait 60s.
    const retryAfter = floodWait > 0 ? floodWait : 60;
    pending.push({
      event_id: row.event_id, telegram_id: row.telegram_id,
      status: result.ok ? "sent" : terminal ? "unreachable" : "retry",
      next_attempt_at: new Date(runtime.now() + retryAfter * 1_000).toISOString(),
      last_error: result.ok ? null : (result.description ?? "Delivery failed").slice(0, 500),
      product_id: result.ok && row.message.kind === "restock" ? (row.message.product_id ?? null) : null,
    });
    if (result.ok) sent += 1;
    else if (!terminal) retry += 1;
    }));
  };
  for (; offset < recipients.length; offset += STOCK_AUDIENCE_CONCURRENCY) {
    if (failure || floodWaits >= MAX_FLOOD_WAITS_PER_RUN) break;
    if (runtime.now() - started >= STOCK_AUDIENCE_BUDGET_MS) break;
    while (inflight.size >= MAX_INFLIGHT_WAVES) await Promise.race(inflight);
    const waveStarted = runtime.now();
    const p: Promise<void> = runWave(recipients.slice(offset, offset + STOCK_AUDIENCE_CONCURRENCY))
      .then(() => (pending.length >= STOCK_AUDIENCE_CHECKPOINT_BATCH ? flush() : undefined))
      .catch((e) => { failure ??= e; }).finally(() => inflight.delete(p));
    inflight.add(p);
    if (offset + STOCK_AUDIENCE_CONCURRENCY < recipients.length) {
      await runtime.wait(Math.max(0, waveMs - (runtime.now() - waveStarted)));
    }
  }
  await Promise.all(inflight);
  // Unattempted claims must remain available, not wait for a stale lease.
  for (const row of recipients.slice(offset)) {
    pending.push({ event_id: row.event_id, telegram_id: row.telegram_id, status: "pending", next_attempt_at: null, last_error: null, product_id: null });
  }
  try { await flush(); } catch (e) { failure ??= e; }
  if (failure) throw failure;
  return { sent, retry };
}