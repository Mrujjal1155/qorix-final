import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronDown, Play, Send, Sparkles } from "lucide-react";
import { listStorefront, getPublicStats } from "@/lib/shop.functions";
import { FaqTeaser, ResellerTeaser, StatsStrip, StayUpdated, Testimonials, WeeklyOffers } from "@/components/HomeTrust";
import { duplicateNotes } from "@/lib/duplicate-products";

const storefrontQuery = queryOptions({ queryKey: ["storefront"], queryFn: () => listStorefront() });
import { StoreShell } from "@/components/StoreShell";
import { CategoryIcon, distinctCategoryIcons } from "@/components/CategoryIcon";
import { ProductCard, type StoreProduct } from "@/components/ProductCard";
import { HeroAnimation } from "@/components/HeroAnimation";
import { FeatureButtons } from "@/components/FeatureButtons";
import { productionUrlFor } from "@/lib/site-url";
import { catalogPriceRange, storeJsonLd } from "@/lib/seo";
import { useT } from "@/lib/i18n";
// Served from public/ so it works on the Cloudflare deploy (qorixlab.com) too.
const EXPLAINER_URL = "/qorix-explainer.mp4";


export const Route = createFileRoute("/")({
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
      { title: "QORIX Store — AI, Developer, SEO, Streaming, VPN & Creative Apps at the Best Price" },
      {
        name: "description",
        content:
          "Premium digital subscriptions — AI tools, developer tools, SEO & marketing tools, streaming, VPN, productivity and creative apps — delivered instantly on the web or through our Telegram bot.",
      },
      { property: "og:title", content: "QORIX Store — AI, Developer, SEO, Streaming, VPN & Creative Apps at the Best Price" },
      { property: "og:description", content: "AI, developer, SEO & marketing, streaming, VPN, productivity and creative apps — at the best price, delivered instantly." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/") },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(storeJsonLd(loaderData?.priceRange ?? null)) }],
    links: [{ rel: "canonical", href: productionUrlFor("/") }],
  }),
  component: Landing,
});

/** Columns of the category grid: 2 on phones, 3 on tablets, 5 on desktops — mirrors the grid classes. */
function useGridCols() {
  const [cols, setCols] = useState(5);
  useEffect(() => {
    const read = () => setCols(window.innerWidth >= 1024 ? 5 : window.innerWidth >= 640 ? 3 : 2);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return cols;
}

function Landing() {
  const t = useT();
  const fetchStore = useServerFn(listStorefront);
  const { data } = useQuery({ ...storefrontQuery, queryFn: () => fetchStore() });

  const products = (data?.products ?? []) as StoreProduct[];
  const countFor = (id: string) => products.filter((p: any) => p.category_id === id).length;
  // Empty categories are hidden on the homepage.
  const categories = (data?.categories ?? []).filter((c: any) => countFor(c.id) > 0);
  const catIcons = distinctCategoryIcons(categories.map((c: any) => String(c.name ?? "")));
  const [playing, setPlaying] = useState(false);
  const fetchStats = useServerFn(getPublicStats);
  const { data: stats } = useQuery({ queryKey: ["public-stats"], queryFn: () => fetchStats(), staleTime: 300_000 });
  const notes = duplicateNotes(products as any[]);
  /* show only two lines of category cards; the rest stays behind "More" */
  const [showAllCats, setShowAllCats] = useState(false);
  const cols = useGridCols();
  const twoLines = cols * 2;
  const moreCats = categories.length > twoLines;
  const visibleCategories = moreCats && !showAllCats ? categories.slice(0, twoLines) : categories;

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

      {/* Explainer video */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            See QORIX in Action
          </h2>
          <p className="mt-3 text-muted-foreground">
            From our storefront to your own reselling business — watch how the
            store, instant delivery and the Telegram bot work together in just
            over a minute.
          </p>
        </div>
        <div className="relative mt-8 overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
          {playing ? (
            <video controls autoPlay playsInline preload="auto" className="aspect-video w-full bg-background">
              <source src={EXPLAINER_URL} type="video/mp4" />
            </video>
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label="Play: QORIX explainer — store, instant delivery and Telegram bot"
              className="group relative flex aspect-video w-full flex-col items-center justify-center gap-4 overflow-hidden text-center"
              style={{
                background:
                  "radial-gradient(60% 70% at 50% 40%, color-mix(in oklab, var(--primary) 30%, transparent), transparent 75%), linear-gradient(135deg, var(--card), var(--background))",
              }}
            >
              <span className="text-2xl font-extrabold tracking-tight sm:text-4xl">
                QORIX<span className="text-primary">.shop</span>
              </span>
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/40 transition-transform group-hover:scale-110 sm:h-24 sm:w-24">
                <Play className="ml-1 h-9 w-9 fill-current sm:h-11 sm:w-11" />
              </span>
              <span className="px-4 text-sm font-semibold text-foreground sm:text-base">
                QORIX explainer — store, instant delivery &amp; Telegram bot
              </span>
            </button>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <a href="https://t.me/QORIX3_bot" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
            <Send className="h-3.5 w-3.5" /> Prefer Telegram? Open @QORIX3_bot
          </a>
        </p>
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
                  <CategoryIcon name={c.name} src={c.image_url} icon={catIcons.get(String(c.name ?? ""))} className="h-7 w-7" />
                </span>
                <h3 className="mt-3 text-sm font-semibold group-hover:text-primary">{c.name}</h3>
                <p className="text-xs text-muted-foreground">{countFor(c.id)} {t(countFor(c.id) === 1 ? "product" : "products")}</p>
              </Link>
            ))}
          </div>

          {moreCats && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAllCats((v) => !v)}
                aria-expanded={showAllCats}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
              >
                {showAllCats ? t("Show less") : t("More")}
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${showAllCats ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          )}
        </section>
      )}

      {/* Featured */}
      {products.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14">
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
              <ProductCard key={p.id} product={p} priority={i < 4} variantNote={notes.get(p.id)} />
            ))}
          </div>
        </section>
      )}

      {data ? (
        <StatsStrip products={products.length} categories={categories.length} delivered={stats?.delivered ?? null} />
      ) : null}
      {/* Real verified reviews only — none exist yet, so this stays hidden. */}
      <Testimonials reviews={[]} />
      <FaqTeaser />
      <ResellerTeaser />
      <StayUpdated />
      <WeeklyOffers products={products} />
    </StoreShell>
  );
}
