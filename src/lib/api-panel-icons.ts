// Shared pure helper for the bot's Reseller API panel artwork.
import { parseIconValue } from "@/lib/bot/icon-value";
import { API_ICONS, type ApiIconKey } from "@/lib/bot/api-icons";
import { websiteIconMedia, type WebsitePremiumIcon } from "@/lib/website-premium-icons";

/** What the website needs to draw one API panel icon exactly like the bot. */
export type ApiPanelIconData = { glyph: string; media?: WebsitePremiumIcon };
export type ApiPanelIcons = Partial<Record<ApiIconKey, ApiPanelIconData>>;

/**
 * Bot-identical artwork for every API panel icon: the Premium emoji media when the
 * bot has one configured, otherwise the same plain glyph the bot shows.
 * `artwork` resolves an emoji ID to public artwork JSON and is injected so this
 * stays browser-safe and testable without network access.
 */
export async function resolveApiPanelIcons(
  settings: Record<string, string>,
  artwork: (emojiId: string, key: ApiIconKey) => Promise<string>,
): Promise<ApiPanelIcons> {
  const out: ApiPanelIcons = {};
  for (const key of Object.keys(API_ICONS) as ApiIconKey[]) {
    const [fallback] = API_ICONS[key];
    const parsed = parseIconValue(settings[`api_icon_${key}`] ?? "", fallback);
    if (!parsed.customId) { out[key] = { glyph: parsed.glyph }; continue; }
    const cached = websiteIconMedia(settings[`api_icon_media_${key}`] ?? "");
    if (cached?.emojiId === parsed.customId) { out[key] = { glyph: parsed.glyph, media: cached }; continue; }
    try {
      const media = websiteIconMedia(await artwork(parsed.customId, key));
      out[key] = media ? { glyph: parsed.glyph, media } : { glyph: parsed.glyph };
    } catch { out[key] = { glyph: parsed.glyph }; }
  }
  return out;
}
