import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronDown, Play, Send } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
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
import { categoriesWithProducts } from "@/lib/category-count";
// Served from public/ so it works on the Cloudflare deploy (qorixlab.com) too.
const EXPLAINER_URL = "/qorix-explainer.mp4";
// Real frame taken from the explainer itself (3s) — always renders, no wait for the video.
const EXPLAINER_POSTER = "/qorix-explainer-poster.jpg";


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
          "AI, developer, SEO, streaming, VPN and creative subscriptions with automatic delivery after payment. Shop on the website or in our Telegram bot @QORIX3_bot.",
      },
      { property: "og:title", content: "QORIX Store — AI, Developer, SEO, Streaming, VPN & Creative Apps at the Best Price" },
      { property: "og:description", content: "AI, developer, SEO, streaming, VPN and creative apps — on the web or via @QORIX3_bot on Telegram." },
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
  // Same definition as /store: categories holding at least one listed product.
  const categories = categoriesWithProducts((data?.categories ?? []) as any[], products as any[]);
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
      <div className="editorial">
      {/* Hero */}
      <section className="relative border-b hairline">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-10 sm:px-6 lg:pb-16 lg:pt-16">
          <HeroAnimation items={(data?.heroItems ?? []) as any} products={products} />
          <FeatureButtons />
        </div>
      </section>

      {/* Explainer video */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="border-t hairline pt-5">
              <p className="eyebrow"><span className="text-primary">01</span> — Watch</p>
              <h2 className="mt-3 text-3xl leading-[1.05] sm:text-4xl">See QORIX in Action</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                From our storefront to your own reselling business — watch how the
                store, instant delivery and the Telegram bot work together in just
                over a minute.
              </p>
              <a href="https://t.me/QORIX3_bot" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 border-b hairline pb-1 text-sm font-medium hover:border-primary hover:text-primary">
                <Send className="h-4 w-4" strokeWidth={1.75} /> Prefer Telegram? Open @QORIX3_bot
              </a>
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="relative overflow-hidden rounded-xl border hairline bg-card">
              {playing ? (
                <video controls autoPlay playsInline preload="metadata" poster={EXPLAINER_POSTER} className="aspect-video w-full bg-background object-contain">
                  <source src={EXPLAINER_URL} type="video/mp4" />
                </video>
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  aria-label="Play: QORIX explainer — store, instant delivery and Telegram bot"
                  className="group relative block aspect-video w-full overflow-hidden text-left"
                >
                  <img
                    src={EXPLAINER_POSTER}
                    alt="QORIX Store explainer video thumbnail"
                    width={1280}
                    height={720}
                    loading="eager"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background/40 transition-transform duration-300 group-hover:scale-105 sm:h-20 sm:w-20">
                      <Play className="ml-1 h-7 w-7 fill-current sm:h-8 sm:w-8" strokeWidth={1.75} />
                    </span>
                  </span>
                  <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-6">
                    <span className="max-w-[75%] text-xs font-medium text-foreground sm:text-base">
                      QORIX explainer — store, instant delivery &amp; Telegram bot
                    </span>
                    <span className="shrink-0 rounded-full border hairline bg-background/70 px-2 py-0.5 text-xs tabular-nums text-foreground">1:11</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:pb-24">
          <SectionHeader
            index="02"
            label="Shop"
            title={t("Shop by category")}
            action={
              <Link to="/store" className="text-sm font-medium text-primary hover:underline">
                {t("All categories →")}
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border hairline sm:grid-cols-3 lg:grid-cols-5" style={{ background: "var(--hairline)" }}>
            {visibleCategories.map((c: any) => (
              <Link
                key={c.id}
                to="/store"
                search={{ c: c.name }}
                className="group flex min-h-[124px] flex-col justify-between bg-background p-4 transition-colors hover:bg-card"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-md border hairline text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary">
                  <CategoryIcon name={c.name} src={c.image_url} icon={catIcons.get(String(c.name ?? ""))} className="h-5 w-5" />
                </span>
                <span>
                  <h3 className="text-sm font-semibold leading-snug">{c.name}</h3>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{c.n} {t(c.n === 1 ? "product" : "products")}</p>
                </span>
              </Link>
            ))}
          </div>

          {moreCats && (
            <div className="mt-5 flex justify-start">
              <button
                type="button"
                onClick={() => setShowAllCats((v) => !v)}
                aria-expanded={showAllCats}
                className="inline-flex items-center gap-2 border-b hairline pb-1 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {showAllCats ? t("Show less") : t("More")}
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${showAllCats ? "rotate-180" : ""}`}
                  strokeWidth={1.75}
                />
              </button>
            </div>
          )}
        </section>
      )}

      {/* Featured */}
      {products.length > 0 && (
        <section className="border-y hairline bg-card/40">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
            <SectionHeader
              index="03"
              label="Featured"
              title={t("Featured Products")}
              action={
                <Link to="/store" className="text-sm font-medium text-primary hover:underline">
                  {t("View All →")}
                </Link>
              }
            />
            <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.slice(0, 12).map((p, i) => (
                <ProductCard key={p.id} product={p} priority={i < 4} variantNote={notes.get(p.id)} stockOnly />
              ))}
            </div>
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
      </div>
    </StoreShell>
  );
}
