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

/** Filter key for products with no supplier: the admin list shows them as "In-house". */
export const IN_HOUSE_FILTER = "__in_house__";

export function supplierFilterKey(supplierName: string | null | undefined): string {
  return String(supplierName ?? "").trim() || IN_HOUSE_FILTER;
}

/** Admin list filtering: one supplier (or in-house) plus the free-text name search. */
export function filterCatalogue<T extends { name: string; supplier_name?: string | null }>(
  products: T[],
  { search = "", supplier = null }: { search?: string; supplier?: string | null },
): T[] {
  const q = search.trim().toLowerCase();
  return products.filter((p) => {
    if (q && !String(p.name).toLowerCase().includes(q)) return false;
    if (supplier && supplierFilterKey(p.supplier_name) !== supplier) return false;
    return true;
  });
}

/** How many products each supplier (and in-house) has, for the clickable filter chips. */
export function countBySupplier<T extends { supplier_name?: string | null }>(products: T[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of products) {
    const key = supplierFilterKey(p.supplier_name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}