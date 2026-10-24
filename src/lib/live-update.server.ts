// Drains live_update_events into the configured public channel.
import { buildLivePost, LIVE_EMOJI_SLOTS, type LiveKind } from "@/lib/live-update";

const KIND_KEY: Record<LiveKind, string> = {
  purchase: "live_purchase",
  topup: "live_topup",
  member: "live_member",
};

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function loadLiveSettings(db: any) {
  const { data } = await db.from("bot_settings").select("key,value").like("key", "live_%");
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) map[r.key] = String(r.value ?? "");
  const emoji: Record<string, string> = {};
  for (const s of LIVE_EMOJI_SLOTS) emoji[s.slot] = map[`live_emoji_${s.slot}`] ?? "";
  return { map, channel: (map["live_channel_id"] ?? "").trim(), emoji };
}

export async function drainLiveUpdates(limit = 20) {
  const db = await adminDb();
  const { map, channel, emoji } = await loadLiveSettings(db);
  const { data: rows } = await db
    .from("live_update_events")
    .select("id,kind,payload,created_at,attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!rows?.length) return { sent: 0 };
  const { sendAlertMessage } = await import("@/lib/telegram.server");
  let sent = 0;
  for (const r of rows as any[]) {
    const kind = r.kind as LiveKind;
    // Channel not set or this type switched off: mark skipped so the queue never piles up.
    if (!channel || (map[KIND_KEY[kind]] ?? "on").toLowerCase() !== "on") {
      await db.from("live_update_events").update({ status: "skipped" }).eq("id", r.id).eq("status", "pending");
      continue;
    }
    // Claim first so two ticks never post the same card.
    const { data: claimed } = await db
      .from("live_update_events")
      .update({ status: "sending", attempts: (r.attempts ?? 0) + 1 })
      .eq("id", r.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;
    const text = buildLivePost(kind, r.payload ?? {}, new Date(r.created_at), emoji);
    const res = await sendAlertMessage(channel, text).catch((e: any) => ({ ok: false, description: String(e) }));
    const ok = !!res?.ok;
    const giveUp = !ok && (r.attempts ?? 0) + 1 >= 5;
    await db
      .from("live_update_events")
      .update(
        ok
          ? { status: "sent", sent_at: new Date().toISOString(), last_error: null }
          : { status: giveUp ? "failed" : "pending", last_error: String(res?.description ?? "send failed").slice(0, 300) },
      )
      .eq("id", r.id);
    if (ok) sent++;
    else break; // channel problem: stop this tick, retry next one
  }
  return { sent };
}

export async function sendLiveTestPost(kind: LiveKind) {
  const db = await adminDb();
  const { channel, emoji } = await loadLiveSettings(db);
  if (!channel) return { ok: false, error: "Channel ID is not set" };
  const { sendAlertMessage } = await import("@/lib/telegram.server");
  const text = buildLivePost(
    kind,
    { uid: "2808123968", name: "Ahmed", product: "Gemini 18 Months", qty: 1, method: "binance_pay", source: "telegram" },
    new Date(),
    emoji,
  );
  const res = await sendAlertMessage(channel, text);
  return res.ok ? { ok: true } : { ok: false, error: res.description ?? "Telegram rejected the post" };
}
