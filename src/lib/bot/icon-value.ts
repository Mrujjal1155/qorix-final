/**
 * Stored icon values support three shapes:
 *   "🔥"                 → plain emoji
 *   "5400280896311944960" → Premium custom emoji (button falls back to default glyph)
 *   "5400280896311944960|🔥" → Premium custom emoji + the glyph to show on buttons
 *
 * Browser-safe: the bot engine and the website both read the same shapes.
 */
export function parseIconValue(configured: string, fallback: string) {
  const value = (configured ?? "").trim();
  if (!value) return { customId: "", glyph: fallback };
  const [first, ...rest] = value.split("|");
  const id = (first ?? "").trim();
  const alt = rest.join("|").trim();
  if (/^\d{8,}$/.test(id)) return { customId: id, glyph: alt || fallback };
  return { customId: "", glyph: value };
}
