import { z } from "zod";
import { availableCatalogue } from "@/lib/bot/catalogue";
import { telegramFavoritesPage } from "@/lib/telegram-top-products";

export const TELEGRAM_TOP_CATEGORIES_KEY = "telegram_top_categories";
export const topCategorySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,36}$/),
  name: z.string().trim().min(1).max(80),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20),
  is_active: z.boolean(),
  emoji_id: z.string().regex(/^\d{1,32}$/).optional(),
  product_ids: z.array(z.string().uuid()).max(300).optional(),
}).refine((row) => row.keywords.length > 0 || (row.product_ids?.length ?? 0) > 0, "Add keywords or select products");
export type TopCategory = z.infer<typeof topCategorySchema>;
export const topCategoriesSchema = z.array(topCategorySchema).refine(
  (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
  "Category IDs must be unique",
);
export const DEFAULT_TOP_CATEGORIES: TopCategory[] = [
  { id: "gemini", name: "All Gemini Product", keywords: ["gemini", "google ai"], is_active: true },
  { id: "lovable", name: "All Lovable Product", keywords: ["lovable"], is_active: true },
  { id: "muse-ai", name: "All Muse AI Product", keywords: ["muse"], is_active: true },
];

export function parseTopCategories(value?: string | null): TopCategory[] {
  if (value == null) return DEFAULT_TOP_CATEGORIES.map((row) => ({ ...row, keywords: [...row.keywords] }));
  try {
    const parsed = topCategoriesSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch { return []; }
}

/** Match full brand words, independently of the admin's display label. */
export function matchesTopCategory(name: string, category: TopCategory): boolean {
  const normalized = name.toLocaleLowerCase().replace(/(\p{L})(\p{N})/gu, "$1 $2").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return category.keywords.some((keyword) => {
    const words = keyword.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return words.length > 0 && ` ${normalized} `.includes(` ${words} `);
  });
}

/** Admin-selected products win; keywords are the fallback when none are selected. */
export function inTopCategory(product: { id?: string; name?: string }, category: TopCategory): boolean {
  if (category.product_ids?.length) return !!product.id && category.product_ids.includes(String(product.id));
  return matchesTopCategory(product.name ?? "", category);
}

/** Products outside every active top category: in-house first, then supplier, original order kept. */
export function standaloneProducts<T extends { id?: string; name?: string; supplier_id?: string | null }>(products: T[], categories: TopCategory[]): T[] {
  const active = categories.filter((c) => c.is_active);
  const rest = products.filter((p) => !active.some((c) => inTopCategory(p, c)));
  return [...rest.filter((p) => !p.supplier_id), ...rest.filter((p) => !!p.supplier_id)];
}

/** Input is already filtered by the server's active/ownership/channel guards. */
export function topCategoryPage<T extends { id?: string; name?: string; stock?: number; delivery_type?: string; manual_stock_limited?: boolean }>(
  products: T[], category: TopCategory, page: number, pageSize = 30,
) {
  const matched = category.is_active
    ? availableCatalogue(products).filter((product) => inTopCategory(product, category))
    : [];
  return telegramFavoritesPage(matched, page, pageSize);
}