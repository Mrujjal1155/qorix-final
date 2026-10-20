// Pure builder for the Telegram "Price list" rich post (shared by preview, send and tests).

export const PRODUCT_LIST_EMOJI_KEYS = [
  { key: "title", label: "Title", fallback: "🛍" },
  { key: "price", label: "Price ($)", fallback: "💲" },
  { key: "instant", label: "Instant delivery", fallback: "✅" },
  { key: "warranty", label: "Warranty", fallback: "🛡" },
  { key: "bulk", label: "Cheaper in bulk", fallback: "🔥" },
  { key: "order", label: "Order here", fallback: "🛒" },
] as const;
export type ProductListEmojiKey = (typeof PRODUCT_LIST_EMOJI_KEYS)[number]["key"];
export const productListSettingKey = (k: string) => `ui_icon_plist_${k}`;

export type ListProduct = { name: string; price: number; emoji?: string | null; custom_emoji_id?: string | null };

/** Same stored shapes as bot UI icons: "🔥", "<id>", or "<id>|🔥". */
export function parseEmoji(value: string | null | undefined, fallback: string) {
  const v = String(value ?? "").trim();
  if (!v) return { customId: "", glyph: fallback };
  const [first, ...rest] = v.split("|");
  const id = (first ?? "").trim();
  if (/^\d{8,}$/.test(id)) return { customId: id, glyph: rest.join("|").trim() || fallback };
  return { customId: "", glyph: v };
}

/** Rich-markdown emoji: Premium custom emoji when an id exists, plain glyph otherwise. */
export function emojiMd(e: { customId: string; glyph: string }) {
  return e.customId ? `![${e.glyph}](tg://emoji?id=${e.customId})` : e.glyph;
}

/** Escape characters that rich Markdown would treat as formatting (incl. table pipes). */
export function escapeMd(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim().replace(/([\\`*_~=|[\]()<>$#!>+\-.{}])/g, "\\$1");
}

export function formatUsd(n: number) {
  return `$${(Math.round(Number(n || 0) * 100) / 100).toFixed(2)}`;
}

export function buildProductListMarkdown(input: {
  storeName: string;
  botUsername: string;
  products: ListProduct[];
  emojis: Record<string, string | undefined>;
}) {
  const e = (k: ProductListEmojiKey) => {
    const def = PRODUCT_LIST_EMOJI_KEYS.find((x) => x.key === k)!;
    return emojiMd(parseEmoji(input.emojis[k], def.fallback));
  };
  const price = e("price");
  const rows = input.products.map((p) => {
    const icon = emojiMd(parseEmoji(p.custom_emoji_id ? `${p.custom_emoji_id}|${p.emoji || "📦"}` : p.emoji, "📦"));
    return `| ${icon} ${escapeMd(p.name)} | ${price} ${escapeMd(formatUsd(p.price))} |`;
  });
  const bot = input.botUsername.replace(/^@/, "");
  return [
    `${e("title")} **${escapeMd(input.storeName)} — PRICE LIST**`,
    `_${input.products.length} products available_`,
    "",
    "| PRODUCT | PRICE |",
    "|:--------|:------|",
    ...rows,
    "",
    `- ${e("instant")} **Instant delivery** — pay and it arrives in seconds, any hour of the day.`,
    `- ${e("warranty")} **Covered by warranty** — a problem gets replaced, not argued about.`,
    `- ${e("bulk")} **Cheaper in bulk** — larger orders drop the unit price automatically at checkout.`,
    "",
    bot ? `${e("order")} **Order here →** @${bot}` : "",
  ].join("\n").trim();
}
