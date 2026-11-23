// Drains live_update_events into the configured public channel.
import { buildLivePost, LIVE_EMOJI_SLOTS, livePostKeyboard, type LiveKind } from "@/lib/live-update";
import { liveDestinations, liveFailure, type LiveEventKind } from "@/lib/live-update-delivery";
import type { TgResult } from "@/lib/telegram.server";

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function loadLiveSettings(db: any) {
  const { data } = await db
    .from("bot_settings")
    .select("key,value")
    .or("key.like.live_%,key.like.announce_%,key.eq.bot_username");
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) map[r.key] = String(r.value ?? "");
  const emoji: Record<string, string> = {};
  for (const s of LIVE_EMOJI_SLOTS) emoji[s.slot] = map[`live_emoji_${s.slot}`] ?? "";
  const bot = (map["bot_username"] ?? "").replace(/^@/, "").trim();
  return { map, channel: (map["live_channel_id"] ?? "").trim(), emoji, bot };
}

// Resolve by order/product IDs, never product name: same-name products can
// have different icons. Batch reads keep the notification tick bounded.
async function loadPurchaseIcons(db: any, rows: any[]): Promise<Map<string, string>> {
  const orderIds = [...new Set(rows
    .filter((r) => r.kind === "purchase" && /^order:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(r.ref ?? "")))
    .map((r) => String(r.ref).slice(6)))];
  const icons = new Map<string, string>();
  if (!orderIds.length) return icons;
  const { data: orders, error: orderError } = await db.from("orders").select("id,product_id").in("id", orderIds);
  if (orderError) throw new Error("Could not load purchase icons");
  const productIds = [...new Set((orders ?? []).map((o: any) => o.product_id).filter(Boolean))];
  if (!productIds.length) return icons;
  const { data: products, error: productError } = await db.from("products")
    .select("id,telegram_custom_emoji_id").in("id", productIds);
  if (productError) throw new Error("Could not load purchase icons");
  const byProduct = new Map<string, string>((products ?? []).map((p: any) => [String(p.id), String(p.telegram_custom_emoji_id ?? "")]));
  for (const order of orders ?? []) icons.set(`order:${order.id}`, byProduct.get(String(order.product_id)) ?? "");
  return icons;
}

export async function drainLiveUpdates(limit = 20) {
  const db = await adminDb();
  const { map, emoji, bot } = await loadLiveSettings(db);
  // Older deployed senders must not mistake payment-only cards for delivered
  // purchases. Only this compatible sender releases those future events.
  const { error: releaseError } = await db.from("live_update_events").update({ status: "pending" }).eq("status", "awaiting_sender").eq("kind", "payment");
  if (releaseError) throw new Error("Could not release verified payment alerts");
  const { data: rows } = await db
    .from("live_update_events")
    .select("id,ref,kind,payload,created_at,attempts,live_sent,general_sent,general_enabled,delivery_errors")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!rows?.length) return { sent: 0 };
  const purchaseIcons = await loadPurchaseIcons(db, rows.filter((r: any) => liveDestinations(r, map).live));
  const { sendAlertMessage } = await import("@/lib/telegram.server");
  let sent = 0;
  let sends = 0;
  for (const r of rows as any[]) {
    const eventKind = r.kind as LiveEventKind;
    const kind: LiveKind = eventKind === "payment" ? "topup" : eventKind;
    const targets = liveDestinations(r, map);
    if (!targets.live && !targets.general) {
      const errors = Object.values(r.delivery_errors ?? {}) as Array<{ status: string }>;
      const status = errors.some((e) => e.status === "review") ? "review" : errors.some((e) => e.status === "failed") ? "failed" : r.live_sent || r.general_sent ? "sent" : "skipped";
      await db.from("live_update_events").update({ status }).eq("id", r.id).eq("status", "pending");
      continue;
    }
    // Leave untouched events pending when this tick's six-send budget is used.
    if (sends + Number(Boolean(targets.live)) + Number(Boolean(targets.general)) > 6) break;
    // Claim first so two ticks never post the same card.
    const { data: claimed } = await db
      .from("live_update_events")
      .update({ status: "sending", attempts: (r.attempts ?? 0) + 1 })
      .eq("id", r.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;
    const text = buildLivePost(kind, { ...(r.payload ?? {}), ...(eventKind === "payment" ? { paymentOnly: true } : {}) }, new Date(r.created_at), emoji);
    // Purchase posts carry a tappable Buy Now button straight into the bot.
    const keyboard = livePostKeyboard(kind, bot, purchaseIcons.get(r.ref));
    const deliveryErrors: Record<string, { status: string; delay: number; description: string }> = { ...(r.delivery_errors ?? {}) };
    for (const destination of ["general", "live"] as const) {
      const target = targets[destination];
      if (!target) continue;
      sends++;
      const res: TgResult | undefined = await (async () => {
        if (destination === "general" && eventKind === "purchase") {
          const { announceOrderSale } = await import("@/lib/bot/engine.server");
          return await announceOrderSale(String(r.ref).slice(6), true);
        }
        const primary = await sendAlertMessage(target, text, keyboard);
        if (destination === "live" && primary.ok) {
          for (const extra of targets.liveExtra ?? []) await sendAlertMessage(extra, text, keyboard).catch(() => null);
        }
        return primary;
      })().catch((e: unknown) => ({ ok: false, description: String(e) }));
      if (res?.ok) {
        delete deliveryErrors[destination];
        // Save this receipt BEFORE trying the other group. A failed write
        // leaves the claim in sending, never blindly replays an accepted post.
        const { error } = await db.from("live_update_events").update({ [`${destination}_sent`]: true }).eq("id", r.id).eq("status", "sending");
        if (error) throw new Error("Could not save accepted group delivery receipt");
        if (destination === "general" && targets.live === target && eventKind !== "purchase") {
          const { error: sameError } = await db.from("live_update_events").update({ live_sent: true }).eq("id", r.id).eq("status", "sending");
          if (sameError) throw new Error("Could not save shared group delivery receipt");
          targets.live = "";
        }
      } else {
        deliveryErrors[destination] = { ...liveFailure(res ?? {}), description: String(res?.description ?? "Uncertain group send; review required").slice(0, 300) };
        const { error } = await db.from("live_update_events").update({ delivery_errors: deliveryErrors }).eq("id", r.id).eq("status", "sending");
        if (error) throw new Error("Could not save group delivery failure");
      }
    }
    const problems = Object.values(deliveryErrors);
    const retry = problems.filter((p) => p.status === "pending");
    const status = retry.length ? "pending" : problems.some((p) => p.status === "review") ? "review" : problems.length ? "failed" : "sent";
    const { error: finishError } = await db.from("live_update_events").update(
      { status, delivery_errors: deliveryErrors, next_attempt_at: new Date(Date.now() + Math.max(0, ...retry.map((p) => p.delay)) * 1000).toISOString(), last_error: problems.length ? problems.map((p) => p.description).join(" | ").slice(0, 300) : null, ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}) },
    ).eq("id", r.id).eq("status", "sending");
    if (finishError) throw new Error("Could not finish group delivery claim");
    if (status === "sent") sent++;
  }
  return { sent };
}

export async function sendLiveTestPost(kind: LiveKind) {
  const db = await adminDb();
  const { channel, emoji, bot } = await loadLiveSettings(db);
  if (!channel) return { ok: false, error: "Channel ID is not set" };
  const { sendAlertMessage } = await import("@/lib/telegram.server");
  const text = buildLivePost(
    kind,
    { uid: "2808123968", name: "Ahmed", product: "Gemini 18 Months", qty: 1, method: "binance_pay", source: "telegram" },
    new Date(),
    emoji,
  );
  const keyboard = livePostKeyboard(kind, bot);
  const res = await sendAlertMessage(channel, text, keyboard);
  return res.ok ? { ok: true } : { ok: false, error: res.description ?? "Telegram rejected the post" };
}
