import { categoryCatalogue, isOutOfStock } from "./catalogue";

export const SHOP_DESIGN_KEY = "telegram_shop_design";
export function shopDesign(value: unknown): "classic" | "simple" {
  return value === "simple" ? "simple" : "classic";
}
export const categoryBannerKey = (id: string) => `category_banner_${id}`;
export const categoryDescriptionKey = (id: string) => `category_description_${id}`;
export type SimpleProduct = { id: string; name: string; price: number; stock?: number; category_id?: string | null; delivery_type?: string; manual_stock_limited?: boolean };
export type SimpleCategory = { id: string; name: string };

/** Inputs are already server visibility-filtered; sold-out plans still count. */
export function simpleShopEntries<C extends SimpleCategory, P extends SimpleProduct>(categories: C[], products: P[], links: Record<string, Set<string>>) {
  return categories.map(category => {
    const plans = categoryCatalogue(products, category.id, links);
    const prices = plans.map(p => Number(p.price));
    const unlimited = plans.some(p => p.delivery_type === "manual" && !p.manual_stock_limited);
    return {
      category, plans,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      stock: plans.reduce((sum, p) => sum + Math.max(0, Number(p.stock ?? 0)), 0),
      unlimited,
      style: plans.length === 1 ? (isOutOfStock(plans[0] ?? {}) ? "danger" : "success") : "primary",
    } as const;
  });
}

export function simplePlanStock(p: SimpleProduct): string {
  return p.delivery_type === "manual" && !p.manual_stock_limited ? "Unlimited" : isOutOfStock(p) ? "Sold out" : `${p.stock ?? 0} left`;
}