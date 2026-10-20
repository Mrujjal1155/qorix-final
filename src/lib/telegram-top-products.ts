/** Separate from website featured ranks: only explicit Telegram admin picks appear. */
export const TELEGRAM_TOP_PRODUCTS_KEY = "telegram_top_product_ids";

export function parseTopProductIds(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))];
  } catch {
    return [];
  }
}

/** Input is the bot's already visibility/availability-filtered, user-priced catalogue. */
export function selectTopProducts<T extends { id: string }>(products: T[], ids: string[]): T[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return [...new Set(ids)].flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });
}