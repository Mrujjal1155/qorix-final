import { sendAlertMessage } from "@/lib/telegram.server";

/** Independent of channel retries: each customer has its own durable checkpoint. */
export async function drainStockAudience(db: any) {
  const { data: rows, error } = await db.rpc("claim_stock_notification_recipients");
  if (error) throw new Error(`Customer notification claim failed: ${error.message}`);
  let sent = 0;
  let retry = 0;
  await Promise.all((rows ?? []).map(async (row: any) => {
    let result;
    try {
      result = await sendAlertMessage(row.telegram_id, row.message.text, row.message.keyboard);
    } catch (error) {
      result = { ok: false, description: error instanceof Error ? error.message : "Send interrupted" };
    }
    const terminal = /bot was blocked|user is deactivated|chat not found/i.test(result.description ?? "");
    const { error: saveError } = await db.from("stock_notification_recipients").update({
      status: result.ok ? "sent" : terminal ? "unreachable" : "retry",
      claimed_at: null,
      next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
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
  return { sent, retry };
}