import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveApiPanelIcons, type ApiPanelIcons } from "@/lib/api-panel-icons";
import { artworkFor } from "@/lib/premium-artwork.server";
import type { ApiIconKey } from "@/lib/bot/api-icons";

/** Unusable emoji IDs are retried only after this pause so anonymous traffic cannot hammer Telegram. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
const failed = new Map<string, number>();

/** Public emoji artwork only — never bot settings, keys or Telegram credentials. */
export async function getApiPanelIconArtwork(): Promise<ApiPanelIcons> {
  const { data, error } = await supabaseAdmin.from("bot_settings").select("key,value");
  if (error) throw new Error("Could not read bot artwork");
  const settings: Record<string, string> = {};
  for (const row of (data ?? []) as { key: string; value: string }[]) settings[row.key] = row.value;
  return resolveApiPanelIcons(settings, async (emojiId, key: ApiIconKey) => {
    const last = failed.get(emojiId);
    if (last !== undefined && Date.now() - last < RETRY_AFTER_MS) throw new Error("Artwork unavailable");
    try {
      const value = await artworkFor(emojiId);
      const { error: saved } = await supabaseAdmin.from("bot_settings")
        .upsert({ key: `api_icon_media_${key}`, value }, { onConflict: "key" });
      if (saved) throw new Error("Could not save artwork");
      failed.delete(emojiId);
      return value;
    } catch (e) {
      if (failed.size > 64) failed.clear();
      failed.set(emojiId, Date.now());
      throw e;
    }
  });
}
