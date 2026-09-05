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

  const { data, error } = await db.from("bot_users").select("telegram_id,is_banned");
  if (error) {
    return { sent: 0, failed: 0, total: 0, error: `Could not load users: ${error.message}` };
  }

  // Skip seeded/test rows: real Telegram ids are far above this range.
  const targets = (data ?? []).filter(
    (u: any) => !u.is_banned && Number(u.telegram_id) > 1_000_000,
  );
  let sent = 0;
  let failed = 0;
  let lastError = "";

  for (const u of targets) {
    const res = await sendOne(u.telegram_id, text, photo);
    if (res.ok) sent++;
    else {
      failed++;
      if (res.error) lastError = res.error;
    }
    // Stay inside Telegram's ~30 messages/second broadcast limit.
    await new Promise((r) => setTimeout(r, 40));
  }

  return { sent, failed, total: targets.length, error: lastError };
}
