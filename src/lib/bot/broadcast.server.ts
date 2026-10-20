// Shared broadcast engine used by both the Telegram admin panel and the website admin.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMessage, sendPhoto } from "@/lib/telegram.server";

const CAPTION_LIMIT = 1024;

export type BroadcastResult = {
  sent: number;
  failed: number;
  total: number;
  error: string;
};

async function sendOne(
  chatId: number | string,
  text: string,
  photo?: string,
): Promise<{ ok: boolean; error?: string | undefined }> {
  const caption = text.trim();

  if (photo) {
    const useCaption = caption.length > 0 && caption.length <= CAPTION_LIMIT;
    const res = await sendPhoto(chatId, photo, useCaption ? caption : undefined);

    if (!res.ok) {
      // Telegram could not fetch/accept the image — still deliver the message.
      const body = caption ? `${caption}\n\n${photo}` : photo;
      const fallback = await sendMessage(chatId, body, undefined, {
        disable_web_page_preview: false,
      });
      return fallback.ok
        ? { ok: true }
        : { ok: false, error: res.description ?? fallback.description };
    }

    // Caption too long for Telegram: send the full text as a follow-up message.
    if (!useCaption && caption) {
      const extra = await sendMessage(chatId, caption);
      if (!extra.ok) return { ok: false, error: extra.description };
    }
    return { ok: true };
  }

  const res = await sendMessage(chatId, caption);
  return { ok: res.ok, error: res.description };
}

export async function runBroadcast(input: {
  text?: string;
  photo?: string;
}): Promise<BroadcastResult> {
  const db = supabaseAdmin as any;
  const text = String(input.text ?? "");
  const photo = input.photo?.trim() || undefined;

  if (!photo && !text.trim()) {
    return { sent: 0, failed: 0, total: 0, error: "Nothing to send (no text, no image)" };
  }

  let users: number[];
  try {
    users = await loadAllBotUserIds();
  } catch (e: any) {
    return { sent: 0, failed: 0, total: 0, error: String(e?.message ?? e) };
  }

  // Groups/channels get one post each; every bot user gets it in their own chat.
  const groups = await loadAnnounceGroups();
  const g = await sendPaced(groups, (id) => sendOne(id, text, photo));
  const u = await sendPaced(users, (id) => sendOne(id, text, photo));

  return {
    sent: u.sent,
    failed: u.failed,
    total: users.length,
    groupsSent: g.sent,
    groupsTotal: groups.length,
    error: u.error || g.error,
  };
}
