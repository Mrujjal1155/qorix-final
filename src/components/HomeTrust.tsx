import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard, discountPct, type StoreProduct } from "@/components/ProductCard";
import { SectionHeader } from "@/components/SectionHeader";
import { useSiteContent } from "@/lib/use-site-content";
import { siteCards } from "@/lib/site-content";

/** Stats computed only from live data; a number we don't have is simply not shown. */
export function StatsStrip({ products, categories, delivered }: { products: number; categories: number; delivered: number | null }) {
  const items = [
    { value: products, label: "Products in catalogue" },
    { value: categories, label: "Categories" },
    ...(delivered && delivered > 0 ? [{ value: delivered, label: "Orders delivered" }] : []),
  ].filter((i) => i.value > 0);
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
      <p className="eyebrow mb-6"><span className="text-primary">04</span> — By the numbers</p>
      <dl className={`grid divide-y hairline border-y sm:divide-x sm:divide-y-0 ${["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3"][items.length]}`}>
        {items.map(({ value, label }) => (
          <div key={label} className="hairline flex items-baseline justify-between gap-4 py-6 sm:block sm:px-6 sm:first:pl-0">
            <dd className="text-4xl font-extrabold tabular-nums sm:text-5xl" style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.04em" }}>
              {value.toLocaleString("en-US")}
            </dd>
            <dt className="eyebrow sm:mt-2">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

export type Review = { name: string; product: string; date?: string; text: string };

/** Real verified buyer reviews only. There is no review data yet, so this renders nothing. */
export function Testimonials({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <h2 className="mb-6 text-3xl">Verified buyer reviews</h2>
      <div className="grid gap-px overflow-hidden rounded-xl border hairline md:grid-cols-3" style={{ background: "var(--hairline)" }}>
        {reviews.map((r, i) => (
          <figure key={i} className="bg-background p-6">
            <blockquote className="text-sm leading-relaxed">“{r.text}”</blockquote>
            <figcaption className="mt-4 text-xs text-muted-foreground">
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
    <section className="section-light py-16 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="eyebrow"><span className="text-primary">05</span> — Questions</p>
          <h2 className="mt-3 text-3xl leading-[1.05] sm:text-4xl">Frequently asked questions</h2>
          <Link to="/faq" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            See all FAQs <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            Prefer Telegram? Order through{" "}
            <a href="https://t.me/QORIX3_bot" target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">@QORIX3_bot</a>.
          </p>
        </div>
        <div className="divide-y divide-border border-y border-border lg:col-span-8">
          {items.map((q, i) => (
            <details key={q.title} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start gap-4 font-semibold marker:hidden">
                <span className="mt-0.5 font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1">{q.title}</span>
                <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 pl-8 text-sm leading-relaxed text-muted-foreground">{q.text}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ResellerTeaser() {
  return (
    <section className="border-b hairline">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-12 md:items-end lg:py-20">
        <div className="md:col-span-8">
          <p className="eyebrow flex items-center gap-2">
            <Store className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
            <span><span className="text-primary">06</span> — Resellers</span>
          </p>
          <h2 className="mt-3 text-3xl leading-[1.05] sm:text-5xl">Become a reseller</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">Reseller prices, with one balance shared between the Telegram bot @QORIX3_bot and our REST API.</p>
        </div>
        <div className="md:col-span-4 md:flex md:justify-end">
          <Button asChild size="lg" className="rounded-md px-7">
            <Link to="/reseller">
              Apply as reseller <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/** No email newsletter exists, so updates go through the existing Telegram channel. */
export function StayUpdated() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div className="flex flex-col gap-5 rounded-xl border hairline p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border hairline text-primary">
            <Bell className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="eyebrow"><span className="text-primary">07</span> — Updates</p>
            <h2 className="mt-1 text-xl sm:text-2xl">Get restock alerts &amp; new offers</h2>
            <p className="mt-1 text-sm text-muted-foreground">Join our Telegram channel — new stock and deals are posted there first.</p>
          </div>
        </div>
        <Button asChild size="lg" variant="outline" className="shrink-0 rounded-md px-6">
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
    <section className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <SectionHeader index="08" label="Offers" title={<>This week&apos;s offers</>} />
      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {offers.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
