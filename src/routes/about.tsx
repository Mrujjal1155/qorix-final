import { createFileRoute } from "@tanstack/react-router";
import { Clock, Headphones, ShieldCheck, Sparkles } from "lucide-react";
import { StoreShell } from "@/components/StoreShell";
import { useSiteContent } from "@/lib/use-site-content";
import { siteCards } from "@/lib/site-content";
import { productionUrlFor } from "@/lib/site-url";
import aboutHero from "@/assets/about-digital-products.jpg";


export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About qorixlab.com — Premium Digital Subscriptions" },
      {
        name: "description",
        content:
          "qorixlab.com delivers genuine premium subscriptions and AI tools at the best price, with instant delivery on the web and inside Telegram.",
      },
      { property: "og:title", content: "About qorixlab.com" },
      { property: "og:description", content: "Who we are and why thousands trust us for premium digital products." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/about") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/about") }],
  }),
  component: AboutPage,
});

const ICONS = [Sparkles, Clock, ShieldCheck, Headphones];

function AboutPage() {
  const { site, v } = useSiteContent();
  const brand = `${v("site_brand_name")}${v("site_brand_suffix")}`;
  const points = siteCards(site, "site_page_about_points");

  return (
    <StoreShell>
      <section className="mx-auto max-w-5xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">
          {v("site_page_about_title").replaceAll("{brand}", brand)}
        </h1>
        <p className="mt-4 max-w-2xl whitespace-pre-line text-muted-foreground">{v("site_page_about_body")}</p>

        <img
          src={aboutHero}
          alt="Digital subscription products — AI tools, VPN, streaming, cloud, music and design apps"
          width={1536}
          height={864}
          loading="lazy"
          className="mt-8 w-full rounded-3xl border border-border object-cover"
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {points.map((p, i) => {
            const Icon = ICONS[i % ICONS.length] ?? Sparkles;
            return (
              <div key={`${p.title}-${i}`} className="rounded-2xl border border-border bg-card p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-lg font-bold">{p.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-14 space-y-10">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Our story</h2>
            <p className="mt-3 text-muted-foreground">
              {brand} started with a simple frustration: premium digital tools are priced for Western
              markets, while creators, students and small businesses everywhere else are left paying two or
              three times what a subscription is really worth. We began by sourcing a handful of legitimate
              plans for friends, and grew into a full storefront serving thousands of orders across the web
              and Telegram — with the same catalogue, the same prices and the same delivery speed on both.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">What we sell</h2>
            <p className="mt-3 text-muted-foreground">
              Our catalogue covers AI assistants and writing tools, VPN and privacy services, streaming and
              music subscriptions, creative and design suites, cloud storage, productivity apps and verified
              accounts. Every product page shows the exact plan length, warranty terms and what you receive,
              so there are no surprises after checkout.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">How ordering works</h2>
            <ol className="mt-3 space-y-2 text-muted-foreground">
              <li>1. Pick a product and plan length from the store or the Telegram bot.</li>
              <li>2. Pay with the method that suits you — crypto, mobile wallets or card gateways.</li>
              <li>3. Your payment is verified automatically and stock is released instantly.</li>
              <li>4. Credentials or activation links appear in your account, inbox and Telegram chat.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">Warranty &amp; support</h2>
            <p className="mt-3 text-muted-foreground">
              Eligible orders carry a replacement warranty for the full plan period. If an account stops
              working, message us with your order number and we replace it — no arguments, no long forms.
              Real people answer on Telegram and WhatsApp around the clock, and every order stays traceable
              from your account dashboard.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">For resellers</h2>
            <p className="mt-3 text-muted-foreground">
              We also run a reseller programme with wholesale pricing, balance top-ups and a REST API so you
              can plug our catalogue straight into your own shop or bot. Apply from the Reseller page and we
              review new partners within a day.
            </p>
          </div>
        </div>
      </section>
    </StoreShell>

  );
}
