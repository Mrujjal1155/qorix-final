import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronDown, Search, Sparkles } from "lucide-react";
import { duplicateNotes } from "@/lib/duplicate-products";
import { listStorefront } from "@/lib/shop.functions";

const storefrontQuery = queryOptions({ queryKey: ["storefront"], queryFn: () => listStorefront() });
import { StoreShell } from "@/components/StoreShell";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ProductCard, type StoreProduct } from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { productionUrlFor } from "@/lib/site-url";
import { catalogPriceRange, storeJsonLd } from "@/lib/seo";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/store/")({
  validateSearch: (search: Record<string, unknown>): { c?: string; q?: string } => {
    const out: { c?: string; q?: string } = {};
    if (typeof search["c"] === "string") out.c = search["c"];
    if (typeof search["q"] === "string") out.q = search["q"];
    return out;
  },
  loader: async ({ context }) => {
    // Server-render the real catalogue so names, prices and stock are in the first HTML.
    try {
      const data: any = await context.queryClient.ensureQueryData(storefrontQuery);
      return { priceRange: catalogPriceRange(data?.products ?? []) };
    } catch {
      /* fall back to client loading with skeletons */
      return { priceRange: null };
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "All Products — QORIX Store" },
      { name: "description", content: "Browse AI tools, creative apps, VPN, streaming and productivity subscriptions with instant delivery." },
      { property: "og:title", content: "All Products — QORIX Store" },
      { property: "og:description", content: "AI, developer, SEO, streaming and VPN subscriptions with automatic delivery after payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/store") },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(storeJsonLd(loaderData?.priceRange ?? null)) }],
    links: [{ rel: "canonical", href: productionUrlFor("/store") }],
  }),
  component: StorePage,
});

function StorePage() {
  const t = useT();
  const fetchStore = useServerFn(listStorefront);
  const { data, isLoading } = useQuery({
    ...storefrontQuery,
    queryFn: () => fetchStore(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });
  const { c, q: q0 } = Route.useSearch();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState(q0 ?? "");
  const [sort, setSort] = useState<"featured" | "price-asc" | "price-desc" | "newest">("featured");
  const [allChips, setAllChips] = useState(false);

  const categories = data?.categories ?? [];
  const linked = c ? categories.find((x: any) => String(x.name).toLowerCase().includes(c.toLowerCase())) : undefined;
  const activeCat = cat === "all" && linked ? (linked as any).id : cat;
  const all = (data?.products ?? []) as StoreProduct[];
  const notes = duplicateNotes(all as any[]);
  const countFor = (id: string) =>
    all.filter((p: any) => ((p.category_ids ?? (p.category_id ? [p.category_id] : [])) as string[]).includes(id)).length;
  // Busiest categories first; the rest fold behind "More categories" (none are removed).
  const chipCats = [...categories]
    .map((c: any) => ({ ...c, n: countFor(c.id) }))
    .sort((a: any, b: any) => b.n - a.n);
  const CHIP_LIMIT = 14;
  const shownChips = allChips
    ? chipCats
    : chipCats.filter((c: any, i: number) => i < CHIP_LIMIT || c.id === activeCatPre());
  function activeCatPre() {
    return cat === "all" && linked ? (linked as any).id : cat;
  }
  const filtered = all.filter((p: any) => {
    const ids: string[] = (p as any).category_ids ?? (p.category_id ? [p.category_id] : []);
    if (activeCat !== "all" && !ids.includes(activeCat)) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const products =
    sort === "featured"
      ? filtered
      : [...filtered].sort((a: any, b: any) =>
          sort === "price-asc"
            ? Number(a.price) - Number(b.price)
            : sort === "price-desc"
              ? Number(b.price) - Number(a.price)
              : String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
        );

  return (
    <StoreShell>
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("All products")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Same catalogue as our Telegram bot — pay with Binance Pay or USDT.")}
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-full pl-9"
              placeholder={t("Search products…")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <CatPill active={activeCat === "all"} onClick={() => setCat("all")} label={t("All")} />
          {shownChips.map((c: any) => (
            <CatPill
              key={c.id}
              active={activeCat === c.id}
              onClick={() => setCat(c.id)}
              label={c.name}
              count={c.n}
              image={c.image_url}
            />
          ))}
          {chipCats.length > CHIP_LIMIT && (
            <button
              type="button"
              onClick={() => setAllChips((v) => !v)}
              aria-expanded={allChips}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 px-4 py-1.5 text-sm font-semibold text-primary"
            >
              {allChips ? t("Show less") : `${t("More categories")} (${chipCats.length - CHIP_LIMIT})`}
              <ChevronDown className={`h-4 w-4 transition-transform ${allChips ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-xl font-bold tracking-tight">
            {activeCat === "all" ? t("Featured Products") : categories.find((x: any) => x.id === activeCat)?.name}
          </h2>
          <span className="h-px flex-1 bg-border" />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only sm:not-sr-only">{t("Sort")}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="newest">Newest</option>
            </select>
          </label>
          {data ? <span className="text-sm text-muted-foreground">{products.length} {t(products.length === 1 ? "item" : "items")}</span> : null}
        </div>

        {isLoading || !data ? (
          <div className="mt-6" aria-busy="true">
            <p className="text-sm text-muted-foreground">{t("Loading catalogue…")}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-72 animate-pulse rounded-2xl border border-border bg-card" />
              ))}
            </div>
          </div>
        ) : products.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">{t("No products found.")}</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 4} variantNote={notes.get(p.id)} />
            ))}
          </div>
        )}
      </section>
    </StoreShell>
  );
}

function CatPill({
  active,
  onClick,
  label,
  count,
  image,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  image?: string | null | undefined;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      <CategoryIcon name={label} src={image} className="h-4 w-4" />
      {label}
      {count !== undefined ? <span className="opacity-70">({count})</span> : null}
    </button>
  );
}
