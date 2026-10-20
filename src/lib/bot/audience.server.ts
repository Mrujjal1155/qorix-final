// Shared audience loader + paced sender for broadcasts and price-list posts.
// Reads every bot user page-by-page so there is no row cap as the user base grows.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PAGE = 1000;

export async function loadAllBotUserIds(): Promise<number[]> {
  const db = supabaseAdmin as any;
  const ids: number[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("bot_users")
      .select("telegram_id,is_banned")
      .order("telegram_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load users: ${error.message}`);
    for (const u of (data ?? []) as any[]) {
      // Skip banned and seeded/test rows: real Telegram ids are far above this range.
      if (!u.is_banned && Number(u.telegram_id) > 1_000_000) ids.push(Number(u.telegram_id));
    }
    if (!data || data.length < PAGE) break;
  }
  return [...new Set(ids)];
}

export async function loadAnnounceGroups(): Promise<string[]> {
  const { data } = await (supabaseAdmin as any)
    .from("bot_settings")
    .select("key,value")
    .or("key.eq.announce_chat_id,key.eq.announce_chat_inhouse,key.like.announce_chat_supplier:%");
  return [
    ...new Set(((data ?? []) as any[]).map((r) => String(r.value ?? "").trim()).filter(Boolean)),
  ];
}

/** Sends in batches of 25 per second (inside Telegram's ~30 msg/s limit). */
export async function sendPaced<T>(
  targets: T[],
  send: (t: T) => Promise<{ ok: boolean; error?: string | undefined }>,
): Promise<{ sent: number; failed: number; error: string }> {
  let sent = 0;
  let failed = 0;
  let error = "";
  const BATCH = 25;
  for (let i = 0; i < targets.length; i += BATCH) {
    const started = Date.now();
    const results = await Promise.all(
      targets.slice(i, i + BATCH).map((t) => send(t).catch((e) => ({ ok: false, error: String(e?.message ?? e) }))),
    );
    for (const r of results) {
      if (r.ok) sent++;
      else {
        failed++;
        if (r.error) error = r.error;
      }
    }
    const wait = 1000 - (Date.now() - started);
    if (i + BATCH < targets.length && wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  return { sent, failed, error };
}
