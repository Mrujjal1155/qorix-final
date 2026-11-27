/** Menu visibility only; purchase/pre-order validation remains in the engine. */
type StockProduct = { stock?: number; delivery_type?: string; manual_stock_limited?: boolean };
type Category = { is_active?: boolean; channel?: string | null };

export function isOutOfStock(product: StockProduct): boolean {
  return !(product.delivery_type === "manual" && !product.manual_stock_limited) && Number(product.stock ?? 0) <= 0;
}

export function availableCatalogue<T extends StockProduct>(products: T[]): T[] {
  return products.filter((product) => !isOutOfStock(product));
}

/** Stable stock partition: available rows first, original admin order kept inside each group. */
export function availableFirst<T extends StockProduct>(products: T[]): T[] {
  return [...products.filter((product) => !isOutOfStock(product)), ...products.filter(isOutOfStock)];
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

export function categoryHasStock<T extends StockProduct & { id: string; category_id?: string | null }>(
  products: T[], categoryId: string, links: Record<string, Set<string>>,
): boolean {
  return categoryCatalogue(products, categoryId, links).some((product) => !isOutOfStock(product));
}

/** Empty and fully sold-out categories move last without changing their saved serial within each group. */
export function stockedCategoriesFirst<
  C extends { id: string },
  P extends StockProduct & { id: string; category_id?: string | null },
>(categories: C[], products: P[], links: Record<string, Set<string>>): C[] {
  return [
    ...categories.filter((category) => categoryHasStock(products, category.id, links)),
    ...categories.filter((category) => !categoryHasStock(products, category.id, links)),
  ];
}

export function stockRowStyle(product: StockProduct, base: "primary" | "success" | "danger" | "default") {
  return isOutOfStock(product) ? "danger" : base;
}
