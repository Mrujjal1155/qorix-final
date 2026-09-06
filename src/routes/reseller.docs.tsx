import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { StoreShell } from "@/components/StoreShell";
import { Button } from "@/components/ui/button";
import { RESELLER_API_BASE, productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/reseller/docs")({
  head: () => ({
    meta: [
      { title: "Reseller API Documentation — QORIX" },
      {
        name: "description",
        content:
          "Complete A-to-Z QORIX reseller API guide: authentication, products, orders, balance, plus copy-paste code to build your own website store or Telegram bot.",
      },
      { property: "og:title", content: "QORIX Reseller API Documentation" },
      {
        property: "og:description",
        content: "Every endpoint explained with examples, plus a full website and Telegram bot starter.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/reseller/docs") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/reseller/docs") }],
  }),
  component: DocsPage,
});

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-3">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(children);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/80 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="overflow-x-auto rounded-xl border border-border/70 bg-secondary/40 p-4 text-xs leading-relaxed">
        <code className="font-mono">{children}</code>
      </pre>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border/60 py-10 first:border-t-0">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

const NAV = [
  ["start", "1. Getting started"],
  ["auth", "2. Authentication"],
  ["endpoints", "3. Endpoints"],
  ["products", "4. List products"],
  ["order", "5. Place an order"],
  ["status", "6. Order status & history"],
  ["balance", "7. Balance & transactions"],
  ["errors", "8. Errors"],
  ["website", "9. Build a website (A→Z)"],
  ["bot", "10. Build a Telegram bot (A→Z)"],
  ["checklist", "11. Go-live checklist"],
  ["faq", "12. FAQ"],
];

function DocsPage() {
  const base = RESELLER_API_BASE;

  return (
    <StoreShell>
      <div className="border-b border-border/60 bg-secondary/30">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Reseller API documentation</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Everything you need to resell our catalogue from your own website or Telegram bot. Follow the guide top to
            bottom — no prior API experience needed.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/reseller">← Back to reseller portal</Link>
            </Button>
            <Button asChild>
              <Link to="/reseller" hash="apply">
                Get an API key
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 text-sm">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="block rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <div>
          <Section id="start" title="1. Getting started">
            <p>
              Three things are needed before your first call: an <strong>approved reseller account</strong>, your{" "}
              <strong>API key</strong>, and some <strong>wallet balance</strong>. Apply on the{" "}
              <Link to="/reseller" className="text-primary underline">
                reseller portal
              </Link>
              ; we email the key after approval.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Base URL: <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">{base}</code></li>
              <li>All responses are JSON and always contain an <code className="font-mono">ok</code> field.</li>
              <li>Prices are in USD and already include your reseller discount.</li>
              <li>Orders are paid instantly from your wallet balance; a failed auto-delivery is refunded automatically.</li>
              <li>CORS is open, but never expose your API key in browser code — always call from your server.</li>
            </ul>
            <p>Quick smoke test from your terminal:</p>
            <Code>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  ${base}/me`}</Code>
          </Section>

          <Section id="auth" title="2. Authentication">
            <p>Send your key on every request, in either header:</p>
            <Code>{`Authorization: Bearer YOUR_API_KEY
# or
x-api-key: YOUR_API_KEY`}</Code>
            <p>
              Sample response of <code className="font-mono">GET /me</code>:
            </p>
            <Code>{`{
  "ok": true,
  "reseller": {
    "id": "6f0c…",
    "name": "Your Store",
    "balance": 128.40,
    "currency": "USD",
    "discount_percent": 15,
    "channels": { "website": true, "bot": true }
  }
}`}</Code>
          </Section>

          <Section id="endpoints" title="3. Endpoints at a glance">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-foreground">
                  <tr className="border-b border-border/70">
                    <th className="py-2 pr-4 font-semibold">Method</th>
                    <th className="py-2 pr-4 font-semibold">Path</th>
                    <th className="py-2 font-semibold">Purpose</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {[
                    ["GET", "/me", "Account info, discount and balance"],
                    ["GET", "/products?channel=website", "Full catalogue with your prices and stock"],
                    ["GET", "/products/{id}", "One product"],
                    ["POST", "/orders", "Buy a product (debits your wallet)"],
                    ["GET", "/orders?limit=50", "Your recent orders"],
                    ["GET", "/orders/{id}", "One order + delivered items"],
                    ["GET", "/transactions", "Wallet ledger"],
                  ].map((r) => (
                    <tr key={r[1]} className="border-b border-border/40">
                      <td className="py-2 pr-4 text-primary">{r[0]}</td>
                      <td className="py-2 pr-4">{r[1]}</td>
                      <td className="py-2 font-sans text-muted-foreground">{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              The <code className="font-mono">channel</code> parameter accepts <code className="font-mono">website</code>,{" "}
              <code className="font-mono">bot</code> or <code className="font-mono">all</code> and filters the catalogue
              to the categories allowed for that channel.
            </p>
            <p>
              Only products that are <b>switched on</b> in our store are returned or purchasable. A product that is off
              (or removed) is invisible to the API — it appears the moment we turn it on, in real time.
            </p>
            <p>
              <b>Live stock webhook.</b> Add a notification URL in your reseller panel and we POST every stock event to
              it at the same moment it goes out on Telegram:{" "}
              <code className="font-mono">restock</code>, <code className="font-mono">new</code>,{" "}
              <code className="font-mono">low</code>, <code className="font-mono">out</code>,{" "}
              <code className="font-mono">price</code>, <code className="font-mono">removed</code>. Each request carries{" "}
              <code className="font-mono">x-qorix-event</code>, <code className="font-mono">x-qorix-timestamp</code> and{" "}
              <code className="font-mono">x-qorix-signature</code> (HMAC-SHA256 of the raw body with your signing
              secret). Verify the signature, then update your own catalogue.
            </p>
            <Code>{`{
  "event": "restock",
  "at": "2026-01-01T12:00:00.000Z",
  "added": 5,
  "product": { "id": "…", "name": "…", "price": 4.5, "stock": 12, "in_stock": true }
}`}</Code>
          </Section>

          <Section id="products" title="4. List products">
            <Code>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${base}/products?channel=website&search=netflix"`}</Code>
            <p>Response (shortened):</p>
            <Code>{`{
  "ok": true,
  "channel": "website",
  "count": 42,
  "categories": [{ "id": "…", "name": "Streaming", "emoji": "🎬" }],
  "products": [
    {
      "id": "b2c1…",
      "name": "Netflix 1 Month",
      "category_id": "…",
      "category_name": "Streaming",
      "description": "Private profile, 30 days warranty",
      "image_url": "https://…",
      "retail_price": 4.99,
      "price": 4.24,            // your buying price
      "currency": "USD",
      "delivery_type": "auto",
      "instant": true,
      "stock": 37,
      "in_stock": true,
      "featured_rank": 1,
      "sort_order": 10
    }
  ]
}`}</Code>
            <p>
              Sell at any price you like: take <code className="font-mono">price</code> as your cost and add your own
              margin. Show <code className="font-mono">stock</code> and hide items where{" "}
              <code className="font-mono">in_stock</code> is false. Query filters:{" "}
              <code className="font-mono">search</code>, <code className="font-mono">category_id</code>.
            </p>
          </Section>

          <Section id="order" title="5. Place an order">
            <Code>{`curl -X POST "${base}/orders" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "product_id": "b2c1…",
    "quantity": 1,
    "channel": "website",
    "external_ref": "my-shop-order-1042",
    "customer_name": "Rahim",
    "customer_email": "rahim@example.com"
  }'`}</Code>
            <p>Successful response (HTTP 201):</p>
            <Code>{`{
  "ok": true,
  "order": {
    "id": "9d…",
    "order_no": 10423,
    "external_ref": "my-shop-order-1042",
    "product_name": "Netflix 1 Month",
    "quantity": 1,
    "unit_price": 4.24,
    "total": 4.24,
    "status": "completed",
    "delivery_type": "auto",
    "items": ["email:pass — profile 2"]
  },
  "balance": 124.16
}`}</Code>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Always send <code className="font-mono">external_ref</code></strong> — your own order id. If the
                same ref is sent twice you get the original order back with{" "}
                <code className="font-mono">"duplicate": true</code> instead of being charged again.
              </li>
              <li>
                <code className="font-mono">status: "completed"</code> → credentials are inside{" "}
                <code className="font-mono">items</code>. <code className="font-mono">"pending"</code> → manual
                delivery; poll the order until it completes.
              </li>
              <li>Insufficient balance returns HTTP 402 with the required amount.</li>
            </ul>
          </Section>

          <Section id="status" title="6. Order status & history">
            <Code>{`# one order
curl -H "Authorization: Bearer YOUR_API_KEY" ${base}/orders/9d…

# last 50 orders
curl -H "Authorization: Bearer YOUR_API_KEY" "${base}/orders?limit=50"`}</Code>
            <p>
              For pending (manual) products, poll every 30–60 seconds until{" "}
              <code className="font-mono">status</code> becomes <code className="font-mono">completed</code>, then show{" "}
              <code className="font-mono">items</code> to your customer.
            </p>
          </Section>

          <Section id="balance" title="7. Balance & transactions">
            <Code>{`curl -H "Authorization: Bearer YOUR_API_KEY" ${base}/transactions`}</Code>
            <p>
              Returns your current balance plus the last 100 ledger entries (top-ups, order debits, refunds). Top-ups are
              made by contacting us; the balance updates instantly once we confirm the payment. Tip: block checkout on
              your site when the balance is below your average order value.
            </p>
          </Section>

          <Section id="errors" title="8. Errors">
            <Code>{`{ "ok": false, "error": "Insufficient balance", "balance": 1.20, "required": 4.24 }`}</Code>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody className="text-xs">
                  {[
                    ["401", "Missing or invalid API key"],
                    ["403", "Account disabled, or that channel is not enabled for you"],
                    ["402", "Not enough wallet balance"],
                    ["404", "Product or order not found"],
                    ["400", "Bad request — check the JSON body and product_id"],
                  ].map((r) => (
                    <tr key={r[0]} className="border-b border-border/40">
                      <td className="py-2 pr-4 font-mono text-primary">{r[0]}</td>
                      <td className="py-2">{r[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="website" title="9. Build your own website — step by step">
            <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <strong>Shortcut — ready-made starter kit.</strong> A complete, zero-dependency storefront and Telegram bot
              live in the <code className="font-mono">examples/reseller-site/</code> folder of the starter repo:{" "}
              <code className="font-mono">server.mjs</code> (product list, Buy now, instant delivery),{" "}
              <code className="font-mono">telegram-bot.mjs</code>, and a ready{" "}
              <code className="font-mono">.env.example</code>. Copy the folder, paste your key, run{" "}
              <code className="font-mono">npm start</code> — your shop is live. The steps below explain the same code if
              you prefer to build it yourself.
            </div>
            <Code>{`cp .env.example .env     # QORIX_KEY = your key
npm start                # http://localhost:3000
npm run bot              # optional Telegram bot`}</Code>
            <p>
              <strong>Step A — create the project.</strong> Any stack works; here is Next.js because it has a server side
              where the key stays safe.
            </p>
            <Code>{`npx create-next-app@latest my-shop
cd my-shop`}</Code>

            <p>
              <strong>Step B — store the key.</strong> Create <code className="font-mono">.env.local</code> (never commit
              it):
            </p>
            <Code>{`QORIX_API=${base}
QORIX_KEY=YOUR_API_KEY`}</Code>

            <p>
              <strong>Step C — one tiny helper</strong> (<code className="font-mono">lib/qorix.js</code>):
            </p>
            <Code>{`export async function qorix(path, options = {}) {
  const res = await fetch(process.env.QORIX_API + path, {
    ...options,
    headers: {
      "Authorization": "Bearer " + process.env.QORIX_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  return res.json();
}`}</Code>

            <p>
              <strong>Step D — show the products</strong> (<code className="font-mono">app/page.jsx</code>). Add your own
              margin, e.g. 20%:
            </p>
            <Code>{`import { qorix } from "@/lib/qorix";

export default async function Home() {
  const data = await qorix("/products?channel=website");
  return (
    <main>
      <h1>My Digital Store</h1>
      <div className="grid">
        {data.products.filter(p => p.in_stock).map(p => (
          <article key={p.id}>
            <img src={p.image_url} alt={p.name} />
            <h2>{p.name}</h2>
            <p>{p.description}</p>
            <strong>\${(p.price * 1.2).toFixed(2)}</strong>
            <form action="/api/buy" method="POST">
              <input type="hidden" name="product_id" value={p.id} />
              <button>Buy now</button>
            </form>
          </article>
        ))}
      </div>
    </main>
  );
}`}</Code>

            <p>
              <strong>Step E — the checkout endpoint</strong> (<code className="font-mono">app/api/buy/route.js</code>).
              Take money from your customer first (Stripe, bKash, crypto…), then call the API:
            </p>
            <Code>{`import { qorix } from "@/lib/qorix";

export async function POST(req) {
  const form = await req.formData();
  // 1) verify your own payment here before continuing

  // 2) buy from QORIX
  const out = await qorix("/orders", {
    method: "POST",
    body: JSON.stringify({
      product_id: form.get("product_id"),
      quantity: 1,
      channel: "website",
      external_ref: "shop-" + Date.now(),      // your own order id
      customer_email: form.get("email") || null,
    }),
  });

  if (!out.ok) return Response.json(out, { status: 400 });

  // 3) deliver to the customer (email / on-screen)
  return Response.json({ items: out.order.items, status: out.order.status });
}`}</Code>

            <p>
              <strong>Step F — deliver & support.</strong> Save every order in your own database (your ref, our{" "}
              <code className="font-mono">order.id</code>, the items). If{" "}
              <code className="font-mono">status</code> is <code className="font-mono">pending</code>, poll{" "}
              <code className="font-mono">/orders/&#123;id&#125;</code> and email the customer when it completes.
            </p>
            <p>
              <strong>Step G — deploy.</strong> Push to GitHub and deploy on Vercel/Netlify. Add{" "}
              <code className="font-mono">QORIX_API</code> and <code className="font-mono">QORIX_KEY</code> as
              environment variables in the hosting dashboard — done, your store is live.
            </p>
            <p className="rounded-xl border border-border/70 bg-secondary/40 p-4">
              No coding at all? A plain HTML page plus a tiny serverless function (Cloudflare Worker / Vercel function)
              with exactly the code in Step E is enough. The only hard rule: the API key lives on the server, never in
              the browser.
            </p>
          </Section>

          <Section id="bot" title="10. Build a Telegram bot — step by step">
            <p>
              <strong>Step A — create the bot.</strong> Open <code className="font-mono">@BotFather</code> in Telegram →{" "}
              <code className="font-mono">/newbot</code> → copy the token.
            </p>
            <p>
              <strong>Step B — project setup</strong> (Node.js):
            </p>
            <Code>{`mkdir my-bot && cd my-bot
npm init -y
npm i node-telegram-bot-api dotenv`}</Code>
            <p>
              <strong>Step C — .env</strong>
            </p>
            <Code>{`BOT_TOKEN=123456:ABC…
QORIX_API=${base}
QORIX_KEY=YOUR_API_KEY`}</Code>
            <p>
              <strong>Step D — the whole bot</strong> (<code className="font-mono">index.js</code>): a product menu, a
              buy button and instant delivery.
            </p>
            <Code>{`require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const api = (path, options = {}) =>
  fetch(process.env.QORIX_API + path, {
    ...options,
    headers: {
      "Authorization": "Bearer " + process.env.QORIX_KEY,
      "Content-Type": "application/json",
    },
  }).then(r => r.json());

const PRICE = p => (p.price * 1.25).toFixed(2);   // your 25% margin

bot.onText(/\\/start/, async (msg) => {
  const data = await api("/products?channel=bot");
  const rows = data.products
    .filter(p => p.in_stock)
    .slice(0, 20)
    .map(p => [{ text: \`\${p.emoji || "🛒"} \${p.name} — $\${PRICE(p)}\`, callback_data: "buy:" + p.id }]);
  bot.sendMessage(msg.chat.id, "Welcome! Choose a product:", {
    reply_markup: { inline_keyboard: rows },
  });
});

bot.on("callback_query", async (q) => {
  const [action, id] = q.data.split(":");
  if (action !== "buy") return;
  bot.answerCallbackQuery(q.id, { text: "Processing…" });

  // charge your own customer here (balance, payment, etc.) before buying

  const out = await api("/orders", {
    method: "POST",
    body: JSON.stringify({
      product_id: id,
      quantity: 1,
      channel: "bot",
      external_ref: "tg-" + q.from.id + "-" + Date.now(),
      customer_name: q.from.first_name,
    }),
  });

  if (!out.ok) return bot.sendMessage(q.message.chat.id, "❌ " + out.error);

  if (out.order.status === "completed") {
    bot.sendMessage(q.message.chat.id,
      "✅ " + out.order.product_name + "\\n\\n<code>" + out.order.items.join("\\n") + "</code>",
      { parse_mode: "HTML" });
  } else {
    bot.sendMessage(q.message.chat.id, "⏳ Order placed, delivery is being prepared. Order #" + out.order.order_no);
  }
});`}</Code>
            <p>
              <strong>Step E — run it.</strong> <code className="font-mono">node index.js</code> locally, then host it
              free/cheap on Railway, Render or a small VPS with{" "}
              <code className="font-mono">pm2 start index.js</code> so it never sleeps.
            </p>
            <p>
              <strong>Step F — improve.</strong> Add categories (group by{" "}
              <code className="font-mono">category_name</code>), a search command, a customer wallet, and an admin alert
              for pending orders. Always store the delivered items on your side too.
            </p>
          </Section>

          <Section id="checklist" title="11. Go-live checklist">
            <ul className="list-disc space-y-1 pl-5">
              <li>API key stored in server environment variables only.</li>
              <li>Unique <code className="font-mono">external_ref</code> on every order.</li>
              <li>Your own database keeps a copy of each order and its delivered items.</li>
              <li>Customer payment is confirmed before calling <code className="font-mono">/orders</code>.</li>
              <li>Catalogue refreshed every few minutes (cache 1–5 min, not longer — stock changes).</li>
              <li>Low-balance alert so sales never fail with HTTP 402.</li>
              <li>Refund/warranty text on your site matching our policy.</li>
            </ul>
          </Section>

          <Section id="faq" title="12. FAQ">
            <p>
              <strong>Do I choose my selling price?</strong> Yes. You pay the discounted{" "}
              <code className="font-mono">price</code>; whatever you charge your customer is your profit.
            </p>
            <p>
              <strong>What if delivery fails?</strong> The order is marked failed and your wallet is refunded
              automatically.
            </p>
            <p>
              <strong>Can I use one key for a website and a bot?</strong> Yes, if both channels are enabled on your
              account — just send the right <code className="font-mono">channel</code> value.
            </p>
            <p>
              <strong>Rate limits?</strong> Be reasonable: cache the catalogue and avoid polling orders more than once
              per 30 seconds.
            </p>
            <p>
              <strong>Need help?</strong> Contact us from the{" "}
              <Link to="/contact" className="text-primary underline">
                support page
              </Link>{" "}
              — we help with integration for free.
            </p>
          </Section>
        </div>
      </div>
    </StoreShell>
  );
}
