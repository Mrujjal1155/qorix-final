const KEY = "qorix_brand_logo_url";

let current = "";

/**
 * The single brand image used everywhere (header, placeholders, fallbacks) is
 * the logo the admin uploads in Website content. Nothing is bundled in the
 * code, so changing it in admin changes it across the whole site.
 */
export function setBrandMark(url?: string | null) {
  const next = (url || "").trim();
  if (!next || next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
}

export function getBrandMark(): string {
  if (current) return current;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) {
      current = stored;
      return stored;
    }
  } catch {
    /* ignore */
  }
  return "";
}
