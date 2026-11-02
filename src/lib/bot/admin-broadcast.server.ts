import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tg, type TgResult } from "@/lib/telegram.server";

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