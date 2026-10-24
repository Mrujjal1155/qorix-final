/** Menu visibility only; purchase/pre-order validation remains in the engine. */
type StockProduct = { stock?: number; delivery_type?: string; manual_stock_limited?: boolean };
type Category = { is_active?: boolean; channel?: string | null };

export function isOutOfStock(product: StockProduct): boolean {
  return !(product.delivery_type === "manual" && !product.manual_stock_limited) && Number(product.stock ?? 0) <= 0;
}

export function availableCatalogue<T extends StockProduct>(products: T[]): T[] {
  return products.filter((product) => !isOutOfStock(product));
}

/** Empty categories are still browseable; never cap the category count at 16. */
export function telegramCategories<T extends Category>(categories: T[]): T[] {
  return categories.filter((category) => category.is_active === true && (category.channel ?? "both") !== "website");
}

/** Inputs already passed active-product and ownership checks in the server reader. */
export function categoryCatalogue<T extends { id: string; category_id?: string | null }>(
  products: T[], categoryId: string, links: Record<string, Set<string>>,
): T[] {
  return products.filter((product) => product.category_id === categoryId || links[categoryId]?.has(product.id));
}

export function stockRowStyle(product: StockProduct, base: "primary" | "success" | "danger" | "default") {
  return isOutOfStock(product) ? "danger" : base;
}