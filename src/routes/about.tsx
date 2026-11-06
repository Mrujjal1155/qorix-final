import { createFileRoute, Link } from "@tanstack/react-router";
import { BOT_HANDLE, BOT_URL } from "@/lib/telegram-bot";
import { Clock, Headphones, ShieldCheck, Sparkles } from "lucide-react";
import { StoreShell } from "@/components/StoreShell";
import { useSiteContent } from "@/lib/use-site-content";
import { siteCards } from "@/lib/site-content";
import { productionUrlFor } from "@/lib/site-url";
import aboutHero from "@/assets/about-hero-qorix.jpg";
import { brandFallbackOnError } from "@/components/SmartImage";


export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About QORIX Store — Digital Subscriptions for Customers Worldwide" },
      {
        name: "description",
        content:
          "QORIX Store sells AI, developer, SEO, streaming and VPN subscriptions with automatic delivery on the website and in the Telegram bot @QORIX3_bot.",
      },
      { property: "og:title", content: "About QORIX Store" },
      { property: "og:description", content: "Who we are, what we sell, how payment and delivery work." },
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
  const points = siteCards(site, "site_page_about_points");

  return (
    <StoreShell>
      <section className="mx-auto max-w-5xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">
          About QORIX Store
        </h1>
        <p className="mt-4 max-w-2xl whitespace-pre-line text-muted-foreground">{v("site_page_about_body")}</p>

        <img
          src={aboutHero}
          alt="QORIX STORE — AI tools, developer tools, SEO tools and premium subscriptions with instant delivery"
          width={1536}
          height={864}
          loading="lazy"
          onError={brandFallbackOnError}
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
              QORIX Store started to make paid digital tools easier to buy for customers around
              the world, including places where international cards are hard to use. We sell the subscriptions we can
              deliver, accept crypto and local mobile wallets, and run the same catalogue on this website and
              in our Telegram bot{" "}
              <a href={BOT_URL} target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">{BOT_HANDLE}</a>.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">What we sell</h2>
            <p className="mt-3 text-muted-foreground">
              Subscriptions, accounts, keys and codes in these groups. The live list, prices and stock are
              always on the <Link to="/store" className="text-primary hover:underline">Store</Link> page.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li><strong className="text-foreground">AI tools</strong> — chat, writing, video and presentation tools.</li>
              <li><strong className="text-foreground">Developer tools</strong> — app builders, hosting, databases and automation.</li>
              <li><strong className="text-foreground">SEO &amp; marketing tools</strong></li>
              <li><strong className="text-foreground">Design &amp; productivity</strong></li>
              <li><strong className="text-foreground">Streaming, learning &amp; VPN</strong></li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              Each product page shows the plan length, warranty period and what you receive.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">Payment</h2>
            <p className="mt-3 text-muted-foreground">
              We accept Binance Pay, USDT (BEP-20 / TRC-20), Bitcoin, and bKash, Nagad or Rocket through
              EPS — whichever methods are enabled at checkout at the time of your order. Payments are
              checked automatically.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">How ordering works</h2>
            <ol className="mt-3 space-y-2 text-muted-foreground">
              <li>1. Pick a product on the website or in {BOT_HANDLE}.</li>
              <li>2. Pay with one of the methods shown at checkout.</li>
              <li>3. Products with automatic stock are delivered as soon as the payment is verified; manual products are sent by our team.</li>
              <li>4. Find your order on the <Link to="/track" className="text-primary hover:underline">Track Order</Link> page, in your account, or in the bot chat.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">Warranty &amp; support</h2>
            <p className="mt-3 text-muted-foreground">
              Warranty depends on the product and is shown on its page. If something stops working inside
              that period, contact support with your order number. See the{" "}
              <Link to="/refund" className="text-primary hover:underline">Refund Policy</Link> for details.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">For resellers</h2>
            <p className="mt-3 text-muted-foreground">
              Approved resellers get reseller prices, balance top-ups and a REST API to sell our catalogue
              in their own shop or bot. Apply from the <Link to="/reseller" className="text-primary hover:underline">Reseller</Link> page.
            </p>
          </div>
        </div>
      </section>
    </StoreShell>

  );
}
