import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, FileText, PackageSearch, Send, ShoppingBag, Store, Wallet } from "lucide-react";
import { StoreShell } from "@/components/StoreShell";
import { Button } from "@/components/ui/button";
import { productionUrlFor } from "@/lib/site-url";
import { ORGANIZATION_ID, breadcrumbJsonLd } from "@/lib/seo";
import { BOT_COMMANDS, BOT_HANDLE, BOT_PAGE_PATH, BOT_URL } from "@/lib/telegram-bot";

const TITLE = "QORIX Telegram Bot — @QORIX3_bot | Shop AI Tools on Telegram";
const DESC =
  "@QORIX3_bot is the QORIX Store shop on Telegram: browse AI, developer, SEO, streaming and VPN subscriptions, pay from your bot wallet, and get automatic delivery in the chat.";

export const Route = createFileRoute("/telegram-bot")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: productionUrlFor(BOT_PAGE_PATH) },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: productionUrlFor(BOT_PAGE_PATH) }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: `QORIX Telegram Bot (${BOT_HANDLE})`,
          alternateName: ["QORIX3_bot", "QORIX Store bot"],
          applicationCategory: "ShoppingApplication",
          operatingSystem: "Telegram",
          url: BOT_URL,
          sameAs: [BOT_URL],
          mainEntityOfPage: productionUrlFor(BOT_PAGE_PATH),
          description: DESC,
          publisher: { "@id": ORGANIZATION_ID },
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
      { type: "application/ld+json", children: JSON.stringify(breadcrumbJsonLd([["Home", "/"], ["Telegram Bot", BOT_PAGE_PATH]])) },
    ],
  }),
  component: BotPage,
});

const FEATURES = [
  { icon: ShoppingBag, title: "Browse the catalogue", text: "The same AI, developer, SEO, streaming, VPN and creative products as the website, grouped by category." },
  { icon: Wallet, title: "Wallet & deposits", text: "Top up your bot wallet with Binance Pay or USDT and pay for orders from the balance." },
  { icon: FileText, title: "Delivery in the chat", text: "Automatic products are sent in the chat after payment is verified. Larger orders arrive as a .txt file." },
  { icon: Bell, title: "Stock alerts", text: "Ask to be notified on a sold-out product and the bot messages you when it is back." },
  { icon: PackageSearch, title: "Order history", text: "See your past orders and their delivery from the bot menu." },
  { icon: Store, title: "Resellers", text: "Approved resellers can use the same balance through our API." },
];

function BotPage() {
  return (
    <StoreShell>
      <section className="mx-auto max-w-5xl px-4 py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Telegram shop</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">QORIX Telegram Bot — {BOT_HANDLE}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          {BOT_HANDLE} is the QORIX Store shop inside Telegram. You can find a product, pay and receive it
          without leaving the chat.
        </p>
        <Button asChild size="lg" className="mt-6 rounded-full px-8">
          <a href={BOT_URL} target="_blank" rel="noopener">
            <Send className="h-5 w-5" /> Open {BOT_HANDLE} on Telegram
          </a>
        </Button>

        <h2 className="mt-14 text-2xl font-bold tracking-tight">What the bot does</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-bold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">How to start</h2>
            <ol className="mt-4 space-y-2 text-muted-foreground">
              <li>1. Open <a className="font-semibold text-primary hover:underline" href={BOT_URL} target="_blank" rel="noopener">{BOT_URL}</a>.</li>
              <li>2. Tap <strong className="text-foreground">Start</strong>.</li>
              <li>3. Pick a category, choose a product and pay.</li>
              <li>4. Your order is sent to the chat once payment is verified.</li>
            </ol>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Commands</h2>
            <ul className="mt-4 space-y-2 text-muted-foreground">
              {BOT_COMMANDS.map(([cmd, text]) => (
                <li key={cmd}><code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{cmd}</code> — {text}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Payment</h2>
            <p className="mt-3 text-muted-foreground">
              The bot shows the payment methods that are currently enabled, such as Binance Pay and USDT
              (BEP-20 / TRC-20). Send the exact amount shown; payments are matched automatically.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Delivery &amp; support</h2>
            <p className="mt-3 text-muted-foreground">
              Products with automatic stock are delivered right after payment is verified. Manually fulfilled
              products are sent by our team. For help, use <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">/support</code> in the bot
              or see the <Link to="/contact" className="text-primary hover:underline">Contact</Link> page.
            </p>
          </div>
        </div>

        <div className="mt-14 rounded-3xl border border-primary/40 bg-primary/10 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Prefer the website?</h2>
          <p className="mt-2 text-muted-foreground">The catalogue and prices are the same on both.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-7">
              <a href={BOT_URL} target="_blank" rel="noopener"><Send className="h-4 w-4" /> Open {BOT_HANDLE}</a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7">
              <Link to="/store">Browse the store</Link>
            </Button>
          </div>
        </div>
      </section>
    </StoreShell>
  );
}
