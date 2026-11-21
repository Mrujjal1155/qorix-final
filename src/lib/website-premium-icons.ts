import { z } from "zod";
import type { CategoryPremiumMedia } from "@/lib/category-premium-media";

export const WEBSITE_PREMIUM_ICONS = [
  { key: "site_web_icon_connect_heading", label: "Connect Telegram · Heading", area: "Connection, deposit and consent messages" },
  { key: "site_web_icon_connect_menu", label: "Connect Telegram · Start menu description", area: "How do you want to continue?" },
  { key: "site_web_icon_connect_button", label: "Connect Telegram · Button", area: "Start menu, deposit and sign-in" },
  { key: "site_web_icon_consent_confirm", label: "Connect as account · Authorization button", area: "Telegram account consent" },
  { key: "site_web_icon_main_menu", label: "Main Menu · Button", area: "Telegram consent and sign-in pages" },
] as const;

export type WebsitePremiumIconKey = typeof WEBSITE_PREMIUM_ICONS[number]["key"];
export type WebsitePremiumIcon = CategoryPremiumMedia & { emojiId: string };
const keys = new Set<string>(WEBSITE_PREMIUM_ICONS.map(icon => icon.key));
export const websiteEmojiId = z.string().trim().regex(/^\d{8,25}$/).or(z.literal(""));
export const websiteIconInput = z.object({
  values: z.record(z.string(), websiteEmojiId).refine(values =>
    Object.keys(values).length > 0 && Object.keys(values).every(key => keys.has(key)), "Unknown website icon"),
});

/** Saved media contains public artwork only, never a Telegram file URL or credentials. */
export function websiteIconMedia(raw: string): WebsitePremiumIcon | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = z.object({ emojiId: z.string().regex(/^\d{8,25}$/), kind: z.enum(["image", "video", "lottie"]), url: z.string().url() }).safeParse(value);
    if (!parsed.success) return;
    const media = parsed.data;
    const url = new URL(media.url);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || url.username || url.password || url.search || url.hash || url.port) return;
    const extension = media.kind === "lottie" ? "json" : media.kind === "video" ? "webm" : "webp";
    if (url.pathname !== `/storage/v1/object/public/public-images/website-premium/${media.emojiId}.${extension}`) return;
    return media;
  } catch { return; }
}