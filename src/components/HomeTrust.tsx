import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell, Boxes, CheckCircle2, LayoutGrid, Store, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard, discountPct, type StoreProduct } from "@/components/ProductCard";
import { useSiteContent } from "@/lib/use-site-content";
import { siteCards } from "@/lib/site-content";

/** Stats computed only from live data; a number we don't have is simply not shown. */
export function StatsStrip({ products, categories, delivered }: { products: number; categories: number; delivered: number | null }) {
  const items = [
    { icon: Boxes, value: products, label: "Products in catalogue" },
    { icon: LayoutGrid, value: categories, label: "Categories" },
    ...(delivered && delivered > 0 ? [{ icon: CheckCircle2, value: delivered, label: "Orders delivered" }] : []),
  ].filter((i) => i.value > 0);
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pb-14">
      <div className={`grid gap-3 rounded-3xl border border-border bg-card p-6 ${["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3"][items.length]}`}>
        {items.map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex items-center justify-center gap-3 text-center sm:flex-col sm:gap-1">
            <Icon className="h-5 w-5 text-primary" />
            <p className="text-2xl font-extrabold">{value.toLocaleString("en-US")}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export type Review = { name: string; product: string; date?: string; text: string };

/** Real verified buyer reviews only. There is no review data yet, so this renders nothing. */
export function Testimonials({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pb-14">
      <h2 className="mb-6 text-xl font-bold tracking-tight">Verified buyer reviews</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {reviews.map((r, i) => (
          <figure key={i} className="rounded-2xl border border-border bg-card p-5">
            <blockquote className="text-sm leading-relaxed">“{r.text}”</blockquote>
            <figcaption className="mt-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{r.name}</span> · {r.product}
              {r.date ? ` · ${r.date}` : ""}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** Top questions straight from the FAQ page content — the one light band on the page. */
export function FaqTeaser() {
  const { site } = useSiteContent();
  const items = siteCards(site, "site_page_faq_items").slice(0, 4);
  if (items.length === 0) return null;
  return (
    <section className="section-light py-14">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">Frequently asked questions</h2>
        <div className="mt-8 space-y-3">
          {items.map((q) => (
            <details key={q.title} className="group rounded-2xl border border-border bg-card p-4">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="text-primary">Q.</span> {q.title}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{q.text}</p>
            </details>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link to="/faq" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            See all FAQs <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            Prefer Telegram? Order through{" "}
            <a href="https://t.me/QORIX3_bot" target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">@QORIX3_bot</a>.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ResellerTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14">
      <div className="flex flex-col items-start gap-4 rounded-3xl border border-primary/40 bg-primary/10 p-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Store className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Become a reseller</h2>
            <p className="mt-1 text-sm text-muted-foreground">Wholesale prices, one shared balance for the website, the Telegram bot @QORIX3_bot and our REST API.</p>
          </div>
        </div>
        <Button asChild size="lg" className="rounded-full px-7">
          <Link to="/reseller">
            Apply as reseller <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** No email newsletter exists, so updates go through the existing Telegram channel. */
export function StayUpdated() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-14">
      <div className="rounded-3xl border border-border bg-card p-8 text-center">
        <Bell className="mx-auto h-6 w-6 text-primary" />
        <h2 className="mt-3 text-xl font-bold tracking-tight">Get restock alerts &amp; new offers</h2>
        <p className="mt-1 text-sm text-muted-foreground">Join our Telegram channel — new stock and deals are posted there first.</p>
        <Button asChild size="lg" variant="outline" className="mt-5 rounded-full px-7">
          <a href="https://t.me/qorixlab" target="_blank" rel="noreferrer">Join @qorixlab on Telegram</a>
        </Button>
      </div>
    </section>
  );
}

/** Presents discounts that already exist (old price above current price); changes nothing. */
export function WeeklyOffers({ products }: { products: StoreProduct[] }) {
  const offers = products
    .filter((p) => discountPct(p) > 0 && p.in_stock !== false)
    .sort((a, b) => discountPct(b) - discountPct(a))
    .slice(0, 4);
  if (offers.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
          <Tag className="h-4 w-4" />
        </span>
        <h2 className="text-xl font-bold tracking-tight">This week&apos;s offers</h2>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {offers.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
