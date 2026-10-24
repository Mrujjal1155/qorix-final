/** Legacy admin picks remain stored separately from website featured ranks. */
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

/** Only credit units count; durations such as 1M and 12 months are not quantities. */
function lovableCredits(name: string): number {
  const match = name.match(/(\d[\d,]*(?:\.\d+)?)\s*([km])?\s*credits?\b/i);
  if (!match?.[1]) return Number.POSITIVE_INFINITY;
  const amount = Number(match[1].replaceAll(",", ""));
  const unit = match[2]?.toLowerCase();
  return amount * (unit === "k" ? 1000 : unit === "m" ? 1000000 : 1);
}

function productBrand(name: string): string {
  const clean = name.toLowerCase().replace(/^\s*(?:link\s*[-–—:]?\s*)/i, "").trim();
  if (/gemini/.test(clean)) return "gemini";
  if (/lovable/.test(clean)) return "lovable";
  if (/^nord\s*vpn/.test(clean)) return "nordvpn";
  return clean.match(/[a-z]+/)?.[0] ?? clean;
}

function productQuantity(name: string): number {
  const credits = lovableCredits(name);
  if (Number.isFinite(credits)) return credits;
  const tokens = name.match(/(\d[\d,]*(?:\.\d+)?)\s*(billion|million|[bm])\s*tokens?\b/i);
  if (!tokens?.[1]) return Number.POSITIVE_INFINITY;
  return Number(tokens[1].replaceAll(",", "")) * (/^(b|billion)$/i.test(tokens[2] ?? "") ? 1e9 : 1e6);
}

/** Stable brand groups retain every distinct product and its effective price/stock. */
export function sortTelegramTopProducts<T extends { name?: string }>(products: T[]): T[] {
  const brands = new Map<string, number>([["gemini", 0], ["lovable", 1]]);
  for (const p of products) {
    const brand = productBrand(p.name ?? "");
    if (!brands.has(brand)) brands.set(brand, brands.size);
  }
  const group = (p: T) => brands.get(productBrand(p.name ?? "")) ?? brands.size;
  return [...products].sort((a, b) => {
    const difference = group(a) - group(b);
    if (difference) return difference;
    const left = productQuantity(a.name ?? "");
    const right = productQuantity(b.name ?? "");
    return left === right ? 0 : left < right ? -1 : 1;
  });
}

/** All input rows have already passed the bot's visibility and availability checks. */
export function telegramFavoritesPage<T extends { name?: string }>(products: T[], requestedPage: number, pageSize: number) {
  const ordered = sortTelegramTopProducts(products);
  const size = Math.max(1, Math.floor(pageSize));
  const lastPage = Math.max(0, Math.ceil(ordered.length / size) - 1);
  const page = Math.max(0, Math.min(Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0, lastPage));
  return { products: ordered.slice(page * size, (page + 1) * size), page, hasPrevious: page > 0, hasNext: page < lastPage, total: ordered.length };
}

/** Input is the bot's already visibility/availability-filtered, user-priced catalogue. */
export function selectTopProducts<T extends { id: string; name?: string }>(products: T[], ids: string[]): T[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return sortTelegramTopProducts([...new Set(ids)].flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  }));
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