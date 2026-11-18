/** Website template switch (Settings → Template Management). Pure helpers only. */
export type SiteTemplate = "basic" | "mobile";

export const TEMPLATE_KEY = "site_template";
export const MOBILE_LOGO_KEY = "site_mobile_logo";
export const MOBILE_NAME_KEY = "site_mobile_name";
export const MOBILE_IMAGES_KEY = "site_mobile_product_images";
export const MOBILE_CAT_IMAGES_KEY = "site_mobile_category_images";

/** Anything other than an explicit "mobile" keeps the current (Basic) design. */
export function activeTemplate(raw: string | undefined | null): SiteTemplate {
  return String(raw ?? "").trim().toLowerCase() === "mobile" ? "mobile" : "basic";
}

/** Parse the saved product-id → image-url map; bad JSON or non-string values are dropped. */
export function parseMobileImages(raw: string | undefined | null): Record<string, string> {
  try {
    const obj = JSON.parse(String(raw ?? "") || "{}");
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) if (typeof v === "string" && v.trim()) out[k] = v.trim();
    return out;
  } catch {
    return {};
  }
}

/** Mobile-template image for a product: its own upload first, then the normal product image. */
export function mobileImageFor(map: Record<string, string>, id: string, fallback?: string | null): string {
  return map[id] || String(fallback ?? "");
}

/** Mobile View shows icons, never emojis: drop bot custom-emoji tags and emoji characters. */
export function stripEmoji(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/\{ce:\d+:[^}]*\}/g, "")
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+/gm, "")
    .trim();
}
