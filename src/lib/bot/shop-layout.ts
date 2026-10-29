/** Admin-chosen Telegram top categories (bot_settings JSON array of category ids). */
export const TELEGRAM_TOP_CATEGORIES_KEY = "telegram_top_category_ids";

/** Telegram allows at most 100 inline buttons per message. */
export const TELEGRAM_MAX_BUTTONS = 100;

/**
 * Split keyboard rows into pages so each page (plus `reserved` fixed buttons)
 * stays within Telegram's 100-button limit. Rows are never split.
 */
export function paginateRows<T>(rows: T[][], reserved: number, requestedPage: number) {
  const budget = Math.max(1, TELEGRAM_MAX_BUTTONS - reserved);
  const pages: T[][][] = [[]];
  let used = 0;
  for (const row of rows) {
    if (used + row.length > budget && pages[pages.length - 1]!.length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1]!.push(row);
    used += row.length;
  }
  const last = pages.length - 1;
  const page = Math.max(0, Math.min(Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0, last));
  return { rows: pages[page]!, page, pages: pages.length };
}

/** Chunk items into rows of `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Selected ids in admin-saved order, keeping only categories that still exist. */
export function pickTopCategories<T extends { id: string }>(categories: T[], ids: string[]): T[] {
  const byId = new Map(categories.map((c) => [String(c.id), c]));
  return [...new Set(ids)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
