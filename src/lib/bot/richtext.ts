/**
 * Supplier text → Telegram HTML.
 *
 * Suppliers (Qamify / Vexoran / Canboso) ship their descriptions with Premium
 * custom emoji encoded as `{ce:<id>}` or `{ce:<id>:<fallback emoji>}` tokens,
 * and their raw text can contain `<`, `>` and `&`. Sending that straight to
 * Telegram either shows the ugly `{ce:123...}` placeholder or breaks the whole
 * HTML message (Telegram rejects the entities and the layout collapses).
 *
 * `renderRich` is the single place that turns supplier text into safe Telegram
 * HTML: everything is escaped first, then the tokens become real
 * `<tg-emoji>` tags so Premium users see the supplier's original icons and
 * everyone else sees the fallback glyph.
 */

// Also matches the bare `[5204116184986844054]` form some suppliers send.
const CE_TOKEN = /\{\s*ce\s*:\s*(\d{5,25})\s*(?::\s*([^}]*?))?\s*\}|\[\s*(\d{15,25})\s*\]/gi;
const DEFAULT_GLYPH = "🔹";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape supplier text and convert `{ce:id}` tokens into Telegram custom emoji. */
export function renderRich(value: string | null | undefined): string {
  const text = String(value ?? "");
  if (!text.trim()) return "";
  return escapeHtml(text)
    .replace(CE_TOKEN, (_m, id: string, glyph?: string) => {
      const fallback = (glyph ?? "").trim() || DEFAULT_GLYPH;
      return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain-text version (website, admin lists, exports): tokens become their glyph. */
export function plainRich(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(CE_TOKEN, (_m, _id: string, glyph?: string) => (glyph ?? "").trim())
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasCustomEmojiToken(value: string | null | undefined) {
  CE_TOKEN.lastIndex = 0;
  return CE_TOKEN.test(String(value ?? ""));
}

/**
 * Admin Telegram message → stored rich text. Premium custom emoji entities
 * become `{ce:<id>:<glyph>}` tokens so renderRich/plainRich show them everywhere.
 */
export function messageToRich(text: string, entities: Array<{ type?: string; offset?: number; length?: number; custom_emoji_id?: string }> = []): string {
  const raw = String(text ?? "");
  const list = entities
    .filter((e) => e?.type === "custom_emoji" && /^\d{5,25}$/.test(String(e.custom_emoji_id ?? "")))
    .sort((a, b) => Number(a.offset) - Number(b.offset));
  let out = "";
  let pos = 0;
  for (const e of list) {
    const offset = Number(e.offset ?? 0);
    const length = Number(e.length ?? 0);
    if (offset < pos) continue;
    out += raw.slice(pos, offset);
    const glyph = raw.slice(offset, offset + length).replace(/[{}:]/g, "");
    out += `{ce:${e.custom_emoji_id}:${glyph}}`;
    pos = offset + length;
  }
  return (out + raw.slice(pos)).trim();
}
