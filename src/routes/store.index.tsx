import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { listStorefront } from "@/lib/shop.functions";
import { StoreShell } from "@/components/StoreShell";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ProductCard, type StoreProduct } from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { productionUrlFor } from "@/lib/site-url";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/store/")({
  validateSearch: (search: Record<string, unknown>): { c?: string; q?: string } => {
    const out: { c?: string; q?: string } = {};
    if (typeof search["c"] === "string") out.c = search["c"];
    if (typeof search["q"] === "string") out.q = search["q"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "All Products — QORIX Store" },
      { name: "description", content: "Browse AI tools, creative apps, VPN, streaming and productivity subscriptions with instant delivery." },
      { property: "og:title", content: "All Products — QORIX Store" },
      { property: "og:description", content: "Premium digital subscriptions at the best price, delivered instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/store") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/store") }],
  }),
  component: StorePage,
});

function StorePage() {
  const t = useT();
  const fetchStore = useServerFn(listStorefront);
  const { data, isLoading } = useQuery({
    queryKey: ["storefront"],
    queryFn: () => fetchStore(),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });
  const { c, q: q0 } = Route.useSearch();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState(q0 ?? "");

  const categories = data?.categories ?? [];
  const linked = c ? categories.find((x: any) => String(x.name).toLowerCase().includes(c.toLowerCase())) : undefined;
  const activeCat = cat === "all" && linked ? (linked as any).id : cat;
  const products = ((data?.products ?? []) as StoreProduct[]).filter((p: any) => {
    const ids: string[] = (p as any).category_ids ?? (p.category_id ? [p.category_id] : []);
    if (activeCat !== "all" && !ids.includes(activeCat)) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

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
          {categories.map((c: any) => (
            <CatPill key={c.id} active={activeCat === c.id} onClick={() => setCat(c.id)} label={c.name} />
          ))}
        </div>

        <div className="mt-8 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-xl font-bold tracking-tight">
            {activeCat === "all" ? t("Featured Products") : categories.find((x: any) => x.id === activeCat)?.name}
          </h2>
          <span className="h-px flex-1 bg-border" />
          <span className="text-sm text-muted-foreground">{products.length} {t("items")}</span>
        </div>

        {isLoading ? (
          <p className="mt-10 text-sm text-muted-foreground">{t("Loading catalogue…")}</p>
        ) : products.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">{t("No products found.")}</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 4} />
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
}: {
  active: boolean;
  onClick: () => void;
  label: string;
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
      <CategoryIcon name={label} className="h-4 w-4" />
      {label}
    </button>
  );
}
