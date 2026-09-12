import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { listStorefront } from "@/lib/shop.functions";
import { StoreShell } from "@/components/StoreShell";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ProductCard, type StoreProduct } from "@/components/ProductCard";
import { HeroAnimation } from "@/components/HeroAnimation";
import { FeatureButtons } from "@/components/FeatureButtons";
import { productionUrlFor } from "@/lib/site-url";
import { useT } from "@/lib/i18n";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QORIX Store — AI Tools, VPN & Creative Apps at the Best Price" },
      {
        name: "description",
        content:
          "Premium digital subscriptions — AI tools, VPN, creative and productivity apps — delivered instantly on the web or through our Telegram bot.",
      },
      { property: "og:title", content: "QORIX Store — Premium Digital Subscriptions" },
      { property: "og:description", content: "AI Tools, VPN, Creative Apps & more — at the best price, delivered instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/") }],
  }),
  component: Landing,
});

function Landing() {
  const t = useT();
  const fetchStore = useServerFn(listStorefront);
  const { data } = useQuery({ queryKey: ["storefront"], queryFn: () => fetchStore() });

  const categories = data?.categories ?? [];
  const products = (data?.products ?? []) as StoreProduct[];
  const countFor = (id: string) => products.filter((p: any) => p.category_id === id).length;
  /* keep rows perfectly filled (5 per row) so no odd dangling card */
  const visibleCategories = categories.slice(0, Math.max(5, Math.floor(categories.length / 5) * 5));

  return (
    <StoreShell>
      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(65% 60% at 50% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-8 lg:pb-16 lg:pt-12">
          <HeroAnimation items={(data?.heroItems ?? []) as any} products={products} />

          <FeatureButtons />

        </div>
      </section>


      {/* Categories */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight">{t("Shop by category")}</h2>
            <span className="h-px flex-1 bg-border" />
            <Link to="/store" className="text-sm text-primary hover:underline">
              {t("All categories →")}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visibleCategories.map((c: any) => (
              <Link
                key={c.id}
                to="/store"
                search={{ c: c.name }}
                className="group rounded-2xl border border-border bg-card px-4 py-6 text-center transition-all hover:-translate-y-1 hover:border-primary/60 hover:card-glow"
              >
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <CategoryIcon name={c.name} />
                </span>
                <h3 className="mt-3 text-sm font-semibold group-hover:text-primary">{c.name}</h3>
                <p className="text-xs text-muted-foreground">{countFor(c.id)} {t("products")}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      {products.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-20">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-bold tracking-tight">{t("Featured Products")}</h2>
            <span className="h-px flex-1 bg-border" />
            <Link to="/store" className="text-sm text-primary hover:underline">
              {t("View All →")}
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.slice(0, 12).map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 4} />
            ))}
          </div>
        </section>
      )}
    </StoreShell>
  );
}
