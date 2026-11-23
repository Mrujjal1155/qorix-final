import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tg, type TgResult } from "@/lib/telegram.server";
import { notifyRoute } from "@/lib/telegram-notify-routes";

export type BroadcastEntity = { type: string; offset: number; length: number; [key: string]: unknown };
export type AdminBroadcastMessage = {
  kind: "broadcast";
  text: string;
  entities: BroadcastEntity[];
  photo?: string;
};

/** Native entities use UTF-16 offsets: never trim or reinterpret the text as HTML. */
export function broadcastMessageFromTelegram(msg: any): AdminBroadcastMessage {
  const photo = Array.isArray(msg.photo) && msg.photo.length
    ? msg.photo[msg.photo.length - 1]?.file_id
    : String(msg.document?.mime_type ?? "").startsWith("image/") ? msg.document.file_id : undefined;
  const text = String(msg.text ?? msg.caption ?? "");
  if (!photo && !text.trim()) throw new Error("Send text or a photo with an optional caption.");
  if (text.length > (photo ? 1024 : 4096)) throw new Error("Message exceeds Telegram's text or caption limit.");
  const entities = (msg.text !== undefined ? msg.entities : msg.caption_entities) ?? [];
  return { kind: "broadcast", text, entities, ...(photo ? { photo } : {}) };
}

export async function enqueueAdminBroadcast(chatId: number, msg: any) {
  if (!Number.isSafeInteger(msg.message_id) || msg.message_id <= 0) throw new Error("Invalid source message.");
  const message = broadcastMessageFromTelegram(msg);
  const { data, error } = await (supabaseAdmin as any).rpc("enqueue_bot_broadcast", {
    _event_key: `broadcast:${chatId}:${msg.message_id}`, _message: message,
  });
  if (error || !data?.id) throw new Error(error?.message ?? "Could not save the broadcast. Please try again.");
  await postAdminBroadcastToGroups(`bgroups:${chatId}:${msg.message_id}`, message).catch((e) => console.error("Broadcast group post failed:", e));
  return data as { id: string; total: number };
}

export async function sendAdminBroadcast(chatId: number, message: AdminBroadcastMessage): Promise<TgResult> {
  return tg(message.photo ? "sendPhoto" : "sendMessage", {
    chat_id: chatId,
    ...(message.photo
      ? { photo: message.photo, caption: message.text, caption_entities: message.entities }
      : { text: message.text, entities: message.entities, disable_web_page_preview: true }),
  }, { alert: true });
}
/** Telegram Notifications matrix: post the broadcast once to every enabled group/channel. */
async function postAdminBroadcastToGroups(eventKey: string, message: AdminBroadcastMessage) {
  const db = supabaseAdmin as any;
  const { data: rows } = await db.from("bot_settings").select("key,value")
    .in("key", ["notify_routes", "notify_chat_general", "notify_chat_updates", "notify_chat_channel", "announce_chat_id", "live_channel_id"]);
  const s = Object.fromEntries(((rows ?? []) as any[]).map((r) => [r.key, String(r.value ?? "")]));
  const route = notifyRoute(s, "admin_broadcast");
  if (!route.configured || !route.groups.length) return;
  // One claim per source message so a repeated Telegram update never double-posts.
  const { data: claim } = await db.from("stock_notification_events").upsert({
    event_key: eventKey, product_id: null, kind: "broadcast", source: "telegram_admin", status: "delivered",
    delivered_at: new Date().toISOString(), audience_message: message, product_snapshot: { name: "Admin broadcast (groups)" },
  }, { onConflict: "event_key", ignoreDuplicates: true }).select("id");
  if (!claim?.length) return;
  for (const chat of route.groups) {
    let r = await sendAdminBroadcast(Number(chat), message);
    const wait = Number((r as any)?.parameters?.retry_after ?? 0);
    if (!r.ok && (r as any)?.error_code === 429 && wait > 0 && wait <= 10) {
      await new Promise((res) => setTimeout(res, wait * 1000));
      r = await sendAdminBroadcast(Number(chat), message);
    }
    console.log(`[broadcast group] ${chat} ${r.ok ? "sent" : `failed: ${r.description ?? "unknown"}`}`);
  }
}
