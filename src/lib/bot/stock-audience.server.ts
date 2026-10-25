import { sendAlertMessage } from "@/lib/telegram.server";

export const STOCK_AUDIENCE_CONCURRENCY = 6;
export const STOCK_AUDIENCE_WAVE_MS = 600;
export const STOCK_AUDIENCE_BUDGET_MS = 10_000;

/** A shared database lease prevents overlapping ticks from multiplying broadcasts. */
export async function drainStockAudience(db: any, runtime = {
  now: () => Date.now(),
  wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}) {
  const started = runtime.now();
  const { data: rows, error } = await db.rpc("claim_stock_notification_recipients_fast");
  if (error) throw new Error(`Customer notification claim failed: ${error.message}`);
  let sent = 0;
  let retry = 0;
  const recipients = rows ?? [];
  let offset = 0;
  for (; offset < recipients.length; offset += STOCK_AUDIENCE_CONCURRENCY) {
    if (runtime.now() - started >= STOCK_AUDIENCE_BUDGET_MS) break;
    const waveStarted = runtime.now();
    await Promise.all(recipients.slice(offset, offset + STOCK_AUDIENCE_CONCURRENCY).map(async (row: any) => {
    let result;
    try {
      result = await sendAlertMessage(row.telegram_id, row.message.text, row.message.keyboard);
    } catch (error) {
      result = { ok: false, description: error instanceof Error ? error.message : "Send interrupted" };
    }
    const terminal = /bot was blocked|user is deactivated|chat not found/i.test(result.description ?? "");
    const retryAfter = Math.max(60, Number(result.parameters?.retry_after ?? 0));
    const { error: saveError } = await db.from("stock_notification_recipients").update({
      status: result.ok ? "sent" : terminal ? "unreachable" : "retry",
      claimed_at: null,
      next_attempt_at: new Date(runtime.now() + retryAfter * 1_000).toISOString(),
      last_error: result.ok ? null : (result.description ?? "Delivery failed").slice(0, 500),
    }).eq("event_id", row.event_id).eq("telegram_id", row.telegram_id).eq("status", "sending");
    if (saveError) throw new Error(`Customer delivery checkpoint failed: ${saveError.message}`);
    if (result.ok) {
      sent += 1;
      if (row.message.kind === "restock") {
        await db.from("stock_alerts").update({ notified_at: new Date().toISOString() })
          .eq("telegram_id", row.telegram_id).eq("product_id", row.message.product_id).is("notified_at", null);
      }
    } else if (!terminal) retry += 1;
    }));
    if (offset + STOCK_AUDIENCE_CONCURRENCY < recipients.length) {
      await runtime.wait(Math.max(0, STOCK_AUDIENCE_WAVE_MS - (runtime.now() - waveStarted)));
    }
  }
  // Unattempted claims must remain available, not wait for a stale lease.
  for (const row of recipients.slice(offset)) {
    const { error: releaseError } = await db.from("stock_notification_recipients")
      .update({ status: "pending", claimed_at: null })
      .eq("event_id", row.event_id).eq("telegram_id", row.telegram_id).eq("status", "sending");
    if (releaseError) throw new Error("Customer notification release failed");
  }
  return { sent, retry };
}