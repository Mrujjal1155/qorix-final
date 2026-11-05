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

export type ListProduct = { name: string; price: number; emoji?: string | null | undefined; custom_emoji_id?: string | null | undefined };

export const PRODUCT_LIST_BATCH_SIZE = 40;
export type ProductListSnapshot = {
  products: ListProduct[];
  storeName: string;
  botUsername: string;
  emojis: Record<string, string | undefined>;
  copy?: ProductListCopy;
};

export type ProductListMode = "all" | "category" | "selected";
export type ProductListCopy = { title: string; intro: string; instant: string; warranty: string; bulk: string; channel: string; updates: string; chat: string };
export function defaultProductListCopy(mode: ProductListMode, name: string): ProductListCopy {
  return { title: mode === "category" ? `${name} — PRODUCT LIST` : mode === "selected" ? "TOP SELLING PRODUCTS" : `${name} — PRICE LIST`,
    intro: mode === "category" ? `${name} products — explore the latest prices below.` : "Explore our latest products and prices.",
    instant: "Instant delivery — pay and it arrives in seconds, any hour of the day.",
    warranty: "Covered by warranty — a problem gets replaced, not argued about.",
    bulk: "Cheaper in bulk — larger orders drop the unit price automatically at checkout.",
    channel: "https://t.me/qorixlab", updates: "", chat: "https://t.me/QORIXCHAT" };
}

export function selectListProducts<T extends { id: string; category_id?: string | null; categoryIds?: string[]; supplier_id?: string | null }>(rows: T[], mode: ProductListMode, categoryId?: string, ids: string[] = []) {
  if (mode === "category") return rows.filter(p => p.category_id === categoryId || p.categoryIds?.includes(categoryId ?? ""));
  if (mode === "selected") { const byId = new Map(rows.map(p => [p.id, p])); return [...new Set(ids)].flatMap(id => { const p = byId.get(id); return p ? [p] : []; }); }
  return rows;
}

export function productListBatch<T>(products: T[], requestedOffset = 0) {
  const offset = requestedOffset < products.length ? requestedOffset : 0;
  const batch = products.slice(offset, offset + PRODUCT_LIST_BATCH_SIZE);
  return {
    products: batch,
    offset,
    totalProducts: products.length,
    nextOffset: offset + batch.length < products.length ? offset + batch.length : 0,
  };
}

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
  copy?: ProductListCopy;
}) {
  const e = (k: ProductListEmojiKey) => {
    const def = PRODUCT_LIST_EMOJI_KEYS.find((x) => x.key === k);
    return emojiMd(parseEmoji(input.emojis[k], def?.fallback ?? "📦"));
  };
  const price = e("price");
  const rows = input.products.map((p) => {
    const icon = emojiMd(parseEmoji(p.custom_emoji_id ? `${p.custom_emoji_id}|${p.emoji || "📦"}` : p.emoji, "📦"));
    return `| ${icon} ${escapeMd(p.name)} | ${price} ${escapeMd(formatUsd(p.price))} |`;
  });
  const bot = input.botUsername.replace(/^@/, "");
  const copy = input.copy;
  return [
    `${e("title")} **${escapeMd(copy?.title ?? `${input.storeName} — PRICE LIST`)}**`,
    copy ? escapeMd(copy.intro) : `_${input.products.length} products available_`,
    "",
    "| PRODUCT | PRICE |",
    "|:--------|:------|",
    ...rows,
    "",
    `- ${e("instant")} ${copy ? escapeMd(copy.instant) : "**Instant delivery** — pay and it arrives in seconds, any hour of the day."}`,
    `- ${e("warranty")} ${copy ? escapeMd(copy.warranty) : "**Covered by warranty** — a problem gets replaced, not argued about."}`,
    `- ${e("bulk")} ${copy ? escapeMd(copy.bulk) : "**Cheaper in bulk** — larger orders drop the unit price automatically at checkout."}`,
    "",
    bot ? `${e("order")} **Order here →** @${bot}` : "",
    ...(copy ? [["Official Channel", copy.channel], ["Update Group", copy.updates], ["General Chat", copy.chat]].filter(([, url]) => url).map(([label, url]) => `[${label}](${url})`) : []),
  ].join("\n").trim();
}

export function buildProductListHtml(input: ProductListSnapshot) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const icon = (value: string | null | undefined, fallback: string) => { const e = parseEmoji(value, fallback); return e.customId ? `<tg-emoji emoji-id="${e.customId}">${esc(e.glyph)}</tg-emoji>` : esc(e.glyph); };
  const e = (key: ProductListEmojiKey) => icon(input.emojis[key], PRODUCT_LIST_EMOJI_KEYS.find(k => k.key === key)?.fallback ?? "📦");
  const copy = input.copy ?? defaultProductListCopy("all", input.storeName);
  const rows = input.products.map(p => `<tr><td>${icon(p.custom_emoji_id ? `${p.custom_emoji_id}|${p.emoji || "📦"}` : p.emoji, "📦")} ${esc(p.name)}</td><td>${e("price")} ${formatUsd(p.price)}</td></tr>`).join("");
  const links = [["Official Channel", copy.channel], ["Update Group", copy.updates], ["General Chat", copy.chat]].filter(([, url]) => url).map(([label, url]) => `<a href="${esc(url ?? "")}">${label}</a>`).join(" · ");
  return `<h3>${e("title")} ${esc(copy.title)}</h3><p>${esc(copy.intro)}</p><table bordered striped compact><tr><th>PRODUCT</th><th>PRICE</th></tr>${rows}</table><p>${e("instant")} ${esc(copy.instant)}</p><p>${e("warranty")} ${esc(copy.warranty)}</p><p>${e("bulk")} ${esc(copy.bulk)}</p><p>${e("order")} Order here → @${esc(input.botUsername.replace(/^@/, ""))}</p><p>${links}</p>`;
}
