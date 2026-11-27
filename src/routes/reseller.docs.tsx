import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { StoreShell } from "@/components/StoreShell";
import { Button } from "@/components/ui/button";
import { RESELLER_API_BASE_PRODUCTION, productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/reseller/docs")({
  head: () => ({
    meta: [
      { title: "QORIX Reseller API — Official documentation" },
      {
        name: "description",
        content:
          "Sell the QORIX catalogue from your own website or Telegram bot: step-by-step setup, every endpoint, order statuses, errors and copy-paste code.",
      },
      { property: "og:title", content: "QORIX Reseller API — Official documentation" },
      { property: "og:description", content: "Connect in 5 minutes: read products, place an order, deliver items to your buyer." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/reseller/docs") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/reseller/docs") }],
  }),
  component: DocsPage,
});

const NAV: [string, string][] = [
  ["quickstart", "🚀 Quick start"],
  ["base-url", "🌐 Base URL"],
  ["auth", "🔐 Authentication"],
  ["conventions", "📐 Conventions"],
  ["endpoints", "🧭 All endpoints"],
  ["ep-me", "👤 GET /me"],
  ["ep-products", "📦 GET /products"],
  ["ep-product", "🔎 GET /products/{id}"],
  ["ep-create-order", "🛒 POST /orders"],
  ["ep-order", "📄 GET /orders/{id}"],
  ["ep-orders", "🗂️ GET /orders"],
  ["ep-transactions", "💳 GET /transactions"],
  ["statuses", "🔄 Order statuses"],
  ["customer-info", "✉️ Products that need buyer info"],
  ["duplicates", "🔁 No duplicate orders"],
  ["delivering", "📬 Delivering to your buyer"],
  ["errors", "🚨 Error reference"],
  ["best", "🏆 Best practices"],
  ["examples", "🧩 Code examples"],
  ["instructions", "📜 Instructions & Terms"],
  ["faq", "❓ FAQ"],
  ["changelog", "🗒️ Changelog"],
  ["support", "💬 Support"],
];

function Code({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 min-w-0 overflow-hidden rounded-xl border border-border/70 bg-secondary/40">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
        <span className="truncate text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">{label ?? "code"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto p-3 text-[0.72rem] leading-relaxed sm:p-4 sm:text-xs">
        <code className="font-mono">{children}</code>
      </pre>
    </div>
  );
}

function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.8em] text-foreground break-words">{children}</code>;
}

function Section({ id, icon, title, children }: { id: string; icon?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-24 border-t border-border/60 py-8 first:border-t-0 first:pt-0 sm:py-10">
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {icon && <span aria-hidden>{icon}</span>}
        <span className="min-w-0">{title}</span>
      </h2>
      <div className="mt-4 min-w-0 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Callout({ tone = "info", children }: { tone?: "info" | "warn" | "ok"; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-destructive/40 bg-destructive/10"
      : tone === "ok"
        ? "border-primary/40 bg-primary/10"
        : "border-border bg-secondary/40";
  const icon = tone === "warn" ? "⚠️" : tone === "ok" ? "✅" : "💡";
  return (
    <div className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border p-4 text-sm ${cls}`}>
      <span aria-hidden>{icon}</span>
      <div className="min-w-0 text-foreground/90">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: [string, ReactNode][] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([t, d], i) => (
        <li key={t} className="min-w-0 rounded-xl border border-border/70 bg-card p-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</div>
          <p className="mt-3 font-semibold text-foreground">{t}</p>
          <div className="mt-1 text-xs text-muted-foreground">{d}</div>
        </li>
      ))}
    </ol>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full min-w-[520px] text-left text-xs sm:text-sm">
        <thead className="bg-secondary/50 text-foreground">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60 align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Endpoint({ id, method, path, title, children }: { id: string; method: "GET" | "POST"; path: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-24 rounded-2xl border border-border/70 bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${method === "GET" ? "bg-primary/15 text-primary" : "bg-accent text-accent-foreground"}`}>{method}</span>
        <code className="min-w-0 break-all font-mono text-sm font-semibold text-foreground">{path}</code>
      </div>
      <h3 className="mt-2 text-base font-bold text-foreground">{title}</h3>
      <div className="mt-3 min-w-0 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Tabs({ tabs }: { tabs: [string, string][] }) {
  const [active, setActive] = useState(0);
  const cur = tabs[active] ?? tabs[0];
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map(([name], i) => (
          <button
            key={name}
            type="button"
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${i === active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {name}
          </button>
        ))}
      </div>
      {cur && <Code label={cur[0]}>{cur[1]}</Code>}
    </div>
  );
}

function DocsPage() {
  const base = RESELLER_API_BASE_PRODUCTION;

  const productJson = `{
  "ok": true,
  "channel": "website",
  "count": 1,
  "categories": [{ "id": "c1a2…", "name": "AI Tools" }],
  "products": [{
    "id": "8f2c1e4a-…",
    "name": "ChatGPT Plus 1 Month",
    "description": "…",
    "category_id": "c1a2…",
    "category_name": "AI Tools",
    "price": 4.25,
    "retail_price": 6.5,
    "currency": "USD",
    "delivery_type": "auto",
    "instant": true,
    "stock": 37,
    "in_stock": true
  }]
}`;

  const orderJson = `{
  "ok": true,
  "order": {
    "id": "5b0e…",
    "order_no": 10432,
    "external_ref": "mybot-20261127-0001",
    "product_id": "8f2c1e4a-…",
    "product_name": "ChatGPT Plus 1 Month",
    "quantity": 2,
    "unit_price": 4.25,
    "total": 8.5,
    "status": "completed",
    "delivery_type": "auto",
    "items": ["email1@x.com:pass1", "email2@x.com:pass2"],
    "customer_name": null,
    "customer_email": null,
    "created_at": "2026-11-27T07:52:10.123Z"
  },
  "balance": 91.5
}`;

  return (
    <StoreShell>
      {/* Hero */}
      <div className="border-b border-border/60 bg-linear-to-b from-primary/10 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">✦ Official documentation</span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">QORIX Reseller API</h1>
          <p className="mt-2 text-lg font-medium text-foreground/80 sm:text-xl">Sell our catalogue from your own website or Telegram bot.</p>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            One simple API: read products and your prices, place an order, and deliver the returned items to your buyer. Every
            example on this page matches the live API exactly.
          </p>
          <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap">
            <Button asChild><a href="#quickstart">🚀 Start in 5 minutes</a></Button>
            <Button asChild variant="secondary"><a href="#ep-create-order">📦 Place an order</a></Button>
            <Button asChild variant="outline"><a href="#instructions">📜 Instructions & Terms</a></Button>
            <Button asChild variant="ghost"><Link to="/reseller">← Reseller portal</Link></Button>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["💰 Prepaid", "Every order is paid from your reseller balance. No balance, no charge."],
              ["🛡️ Safe", "If a product cannot be delivered, the full amount returns to your balance automatically."],
              ["🔁 No duplicates", "Send the same external_ref again and you get the same order back — never a second charge."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-border/70 bg-card/70 p-4">
                <p className="font-semibold text-foreground">{t}</p>
                <p className="mt-1 text-xs text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-10 lg:py-10">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-0.5 overflow-y-auto pr-2 text-sm">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block truncate rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <nav className="sticky top-14 z-10 -mx-4 flex gap-2 overflow-x-auto border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-border/70 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground">
              {label}
            </a>
          ))}
        </nav>

        <div className="min-w-0">
          <Section id="quickstart" icon="🚀" title="Quick start">
            <p>Get an approved reseller account and API key from the reseller portal. Then follow these four steps. Every request is authenticated.</p>
            <Steps
              items={[
                ["Authenticate", <C key="a">Authorization: Bearer …</C>],
                ["Read products", <C key="b">GET /products</C>],
                ["Create order", <C key="c">POST /orders</C>],
                ["Deliver", <span key="d">send <C>items</C> to your buyer</span>],
              ]}
            />
            <Callout tone="warn">
              A response can be lost on the network after we have already created the order. <b>Never place a second order to recover it.</b>{" "}
              Send the same request again with the same <C>external_ref</C>, or check <C>GET /orders</C>.
            </Callout>
            <Callout tone="ok">
              Using a ready-made panel (SMM / shop script) with a “Supplier API” page? You only need to paste the <b>Base URL</b> and <b>API key</b> below, then add balance.
            </Callout>
          </Section>

          <Section id="base-url" icon="🌐" title="Base URL">
            <p>All endpoints live under this address. Copy it exactly:</p>
            <Code label="base url">{base}</Code>
            <Table
              head={["❌ Wrong", "Why it fails"]}
              rows={[
                [<C key="1">https://www.qorixlab.com/api/public/reseller/v1</C>, "www causes a redirect"],
                [<C key="2">https://qorixlab.com/api/public/reseller</C>, "missing /v1 → 404"],
                [<C key="3">{base}/</C>, "trailing slash"],
              ]}
            />
            <Callout>
              Some panels send requests with <C>redirect: "error"</C>, which our hosting refuses. Use <C>redirect: "manual"</C> or remove the option.
            </Callout>
          </Section>

          <Section id="auth" icon="🔐" title="Authentication">
            <p>Send your key on every request using either header:</p>
            <Code label="headers">{`Authorization: Bearer YOUR_API_KEY
X-API-Key: YOUR_API_KEY`}</Code>
            <ul className="list-disc space-y-1 pl-5">
              <li>Your key is linked to your reseller account and balance. The shop can disable it at any time.</li>
              <li>Keep it secret: use it only on your server or bot backend, never in browser JavaScript or a public repo.</li>
              <li>A missing or wrong key returns <C>401</C>. A disabled account returns <C>403</C>.</li>
            </ul>
          </Section>

          <Section id="conventions" icon="📐" title="Conventions & data types">
            <h3 className="font-semibold text-foreground">JSON and money</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Every response is JSON with <C>"ok": true</C> on success or <C>"ok": false, "error": "…"</C> on failure.</li>
              <li>Money is a number in <b>USD</b>, e.g. <C>4.25</C>. Unit prices can have up to 4 decimals (e.g. <C>0.025</C>); totals are rounded to cents.</li>
              <li>IDs are UUID strings. Timestamps are ISO-8601 in UTC, e.g. <C>2026-11-27T07:52:10Z</C>.</li>
            </ul>
            <h3 className="pt-2 font-semibold text-foreground">Quantity and stock</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li><C>quantity</C> is a whole number from <b>1 to 50</b> per order.</li>
              <li><C>stock</C> is the sellable count right now; <C>in_stock</C> tells you if the product can be ordered.</li>
              <li><C>price</C> is <b>your</b> price after your reseller discount — that is what your balance pays.</li>
            </ul>
            <h3 className="pt-2 font-semibold text-foreground">Channels</h3>
            <p>
              Add <C>?channel=website</C> (default) or <C>?channel=bot</C> to say where you sell. The shop enables each channel per account; a disabled channel returns <C>403</C>.
            </p>
          </Section>

          <Section id="endpoints" icon="🧭" title="All endpoints">
            <Table
              head={["Method", "Path", "What it does"]}
              rows={[
                ["GET", <C key="1">/me</C>, "Your account and balance"],
                ["GET", <C key="2">/products</C>, "Product list with your prices and stock"],
                ["GET", <C key="3">/products/{"{id}"}</C>, "One product (refresh before checkout)"],
                ["POST", <C key="4">/orders</C>, "Place an order and receive items"],
                ["GET", <C key="5">/orders/{"{id}"}</C>, "One order — poll pending orders here"],
                ["GET", <C key="6">/orders</C>, "Your order history, newest first"],
                ["GET", <C key="7">/transactions</C>, "Balance history (top-ups, orders, refunds)"],
              ]}
            />
          </Section>

          <div className="space-y-5 pb-8">
            <Endpoint id="ep-me" method="GET" path="/me" title="Account and balance">
              <p>Use this to test your key and show your current balance.</p>
              <Code label="curl">{`curl ${base}/me \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</Code>
              <Code label="response 200">{`{
  "ok": true,
  "reseller": {
    "id": "…",
    "name": "My Shop",
    "balance": 100.0,
    "currency": "USD",
    "discount_percent": 5,
    "channels": { "website": true, "bot": true }
  }
}`}</Code>
            </Endpoint>

            <Endpoint id="ep-products" method="GET" path="/products" title="Product list">
              <p>Returns every product you can sell right now, with your price and live stock.</p>
              <Table
                head={["Query parameter", "Required", "Meaning"]}
                rows={[
                  [<C key="1">channel</C>, "no", "website (default) or bot"],
                  [<C key="2">search</C>, "no", "filter by product name"],
                  [<C key="3">category_id</C>, "no", "only one category"],
                ]}
              />
              <Code label="curl">{`curl "${base}/products?channel=bot" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</Code>
              <Code label="response 200">{productJson}</Code>
              <Callout>Sync your catalogue by <C>id</C> (update existing rows, add new ones, hide missing ones). Names and prices can change.</Callout>
            </Endpoint>

            <Endpoint id="ep-product" method="GET" path="/products/{id}" title="One product">
              <p>Same fields as one item from the list. Call it right before checkout to confirm the price and stock. Returns <C>404</C> if the product is unavailable.</p>
              <Code label="curl">{`curl ${base}/products/PRODUCT_ID \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</Code>
            </Endpoint>

            <Endpoint id="ep-create-order" method="POST" path="/orders" title="Place an order">
              <p>Charges your balance and returns the delivered items in the same response for instant products.</p>
              <Table
                head={["Body field", "Required", "Meaning"]}
                rows={[
                  [<C key="1">product_id</C>, "yes", "product id from /products"],
                  [<C key="2">quantity</C>, "no", "1–50, default 1"],
                  [<C key="3">external_ref</C>, "recommended", "your own unique order id (max 120 chars) — prevents duplicates"],
                  [<C key="4">customer_email</C>, "only if needed", "buyer email for products that need it (see below)"],
                  [<C key="5">customer_name</C>, "no", "buyer name for your records (max 80 chars)"],
                  [<C key="6">channel</C>, "no", "website (default) or bot"],
                ]}
              />
              <Code label="curl">{`curl -X POST ${base}/orders \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"product_id":"PRODUCT_ID","quantity":2,"external_ref":"mybot-20261127-0001"}'`}</Code>
              <Code label="response 201">{orderJson}</Code>
              <p>
                <b>201</b> = new order. If the order is still being delivered you get <C>"status": "pending"</C> and <C>"submitted": true</C> — poll <C>GET /orders/{"{id}"}</C>.
              </p>
            </Endpoint>

            <Endpoint id="ep-order" method="GET" path="/orders/{id}" title="One order">
              <p>The id can be the order <C>id</C>, the <C>order_no</C> or your own <C>external_ref</C> — handy to recover a lost response. Returns the same <C>order</C> object. Poll every 5–10 seconds while <C>status</C> is <C>pending</C>.</p>
              <Code label="curl">{`curl ${base}/orders/ORDER_ID \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</Code>
            </Endpoint>

            <Endpoint id="ep-orders" method="GET" path="/orders" title="Order history">
              <p>Newest first. <C>?limit=</C> 1–100 (default 50).</p>
              <Code label="curl">{`curl "${base}/orders?limit=20" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</Code>
              <Code label="response 200">{`{ "ok": true, "orders": [ { "id": "…", "status": "completed", … } ] }`}</Code>
            </Endpoint>

            <Endpoint id="ep-transactions" method="GET" path="/transactions" title="Balance history">
              <p>Your latest 100 balance movements.</p>
              <Code label="response 200">{`{
  "ok": true,
  "balance": 91.5,
  "transactions": [
    { "id": "…", "type": "order", "amount": -8.5, "balance_after": 91.5,
      "reference": "…", "note": "Order #10432", "created_at": "…" }
  ]
}`}</Code>
            </Endpoint>
          </div>

          <Section id="statuses" icon="🔄" title="Order statuses">
            <Table
              head={["status", "Meaning", "What you do"]}
              rows={[
                [<C key="1">completed</C>, "Delivered. items holds everything.", "Send items to your buyer."],
                [<C key="2">pending</C>, "Paid, delivery in progress (manual products or a short delay).", "Poll GET /orders/{id}. Do not order again."],
                [<C key="3">failed</C>, "Could not deliver. With refunded: true the full amount is back in your balance.", "Refund or offer another product to your buyer."],
              ]}
            />
            <Callout>Only the entries in <C>items</C> are delivered. Pending means paid but not delivered yet.</Callout>
          </Section>

          <Section id="customer-info" icon="✉️" title="Products that need buyer info (email)">
            <p>
              Some products are delivered by the shop to a buyer account, for example an invite sent to an email address. These products have{" "}
              <C>"delivery_type": "manual"</C> and the product description tells you what is needed.
            </p>
            <Steps
              items={[
                ["Find the product", <span key="a"><C>delivery_type: "manual"</C></span>],
                ["Ask your buyer", "collect their email"],
                ["Submit order", <span key="c"><C>customer_email</C> in the body</span>],
                ["Poll result", <C key="d">GET /orders/{"{id}"}</C>],
              ]}
            />
            <Code label="curl">{`curl -X POST ${base}/orders \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"product_id":"PRODUCT_ID","quantity":1,
       "external_ref":"invite-0001",
       "customer_email":"buyer@example.com"}'`}</Code>
            <p>
              You can also send <C>{`"customer_inputs": {"email": "buyer@example.com"}`}</C> — it is treated the same way. The order returns <C>pending</C>, then becomes{" "}
              <C>completed</C> with a confirmation in <C>items</C>, or <C>failed</C> with an automatic refund.
            </p>
          </Section>

          <Section id="duplicates" icon="🔁" title="No duplicate orders">
            <p>
              Give every order your own unique <C>external_ref</C> (for example your order number). If you send the same <C>external_ref</C> again, the API returns the
              <b> existing</b> order and does not charge again.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Network timeout? Retry with the <b>same</b> <C>external_ref</C>.</li>
              <li>New buyer purchase? Use a <b>new</b> <C>external_ref</C>.</li>
              <li>Never retry in a loop with new references — that creates new paid orders.</li>
            </ul>
          </Section>

          <Section id="delivering" icon="📬" title="Delivering to your buyer">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Refresh the product with <C>GET /products/{"{id}"}</C> and check <C>in_stock</C>.</li>
              <li>Call <C>POST /orders</C>; store <C>order.id</C> and each <C>items[]</C> entry.</li>
              <li>If <C>status</C> is <C>pending</C>, poll until it is <C>completed</C> or <C>failed</C>.</li>
              <li>Send every entry of <C>items</C> to your buyer. Show them the product's instructions (<C>quick_guide</C> / <C>important_note</C>).</li>
            </ol>
            <Callout>1–5 items: send each in its own message. More items: send them as one .txt file.</Callout>
          </Section>

          <Section id="errors" icon="🚨" title="Error reference">
            <p>Errors always look like <C>{`{"ok": false, "error": "…"}`}</C>, sometimes with a <C>code</C>.</p>
            <Table
              head={["HTTP", "error / code", "Meaning", "Charged?"]}
              rows={[
                ["400", "product_id is required / Invalid JSON body", "Request is malformed", "No"],
                ["401", "Missing API key / Invalid API key", "Check your key and header", "No"],
                ["402", "Insufficient balance", "Top up; response includes balance and required", "No"],
                ["403", "…access is disabled", "Account or channel disabled", "No"],
                ["404", "Product not found", "Inactive or unknown product", "No"],
                ["409", <span key="o"><C>out_of_stock</C> — Product temporarily unavailable</span>, "No stock right now", "No"],
                ["409", <span key="d"><C>delivery_failed</C> — Product temporarily unavailable</span>, "Could not deliver", "Refunded automatically"],
                ["503", "… temporarily unavailable", "Try again shortly; check /orders before re-ordering", "Check order"],
              ]}
            />
          </Section>

          <Section id="best" icon="🏆" title="Best practices">
            <ul className="list-disc space-y-1 pl-5">
              <li>Keep the API key on your server only.</li>
              <li>Always send <C>external_ref</C>.</li>
              <li>Cache the product list for 30–60 seconds; refresh one product before checkout.</li>
              <li>Poll pending orders every 5–10 seconds, not faster.</li>
              <li>Show <b>“temporarily unavailable”</b> to buyers when you get 409 — never retry automatically.</li>
              <li>Watch your balance with <C>GET /me</C> and top up before it runs out.</li>
            </ul>
          </Section>

          <Section id="examples" icon="🧩" title="Code examples">
            <Tabs
              tabs={[
                [
                  "JavaScript",
                  `const BASE = "${base}";
const KEY = process.env.QORIX_API_KEY;

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    redirect: "manual",
    headers: { Authorization: \`Bearer \${KEY}\`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

const { products } = await api("/products");
const { order } = await api("/orders", {
  method: "POST",
  body: JSON.stringify({ product_id: products[0].id, quantity: 1, external_ref: "my-order-1" }),
});
console.log(order.status, order.items);`,
                ],
                [
                  "Python",
                  `import os, requests

BASE = "${base}"
H = {"Authorization": f"Bearer {os.environ['QORIX_API_KEY']}"}

products = requests.get(f"{BASE}/products", headers=H).json()["products"]
r = requests.post(f"{BASE}/orders", headers=H, json={
    "product_id": products[0]["id"], "quantity": 1, "external_ref": "my-order-1",
}).json()
if r["ok"]:
    print(r["order"]["status"], r["order"]["items"])
else:
    print("Error:", r["error"])`,
                ],
                [
                  "PHP",
                  `<?php
$base = "${base}";
$ch = curl_init("$base/orders");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => ["Authorization: Bearer " . getenv("QORIX_API_KEY"), "Content-Type: application/json"],
  CURLOPT_POSTFIELDS => json_encode(["product_id" => "PRODUCT_ID", "quantity" => 1, "external_ref" => "my-order-1"]),
]);
$r = json_decode(curl_exec($ch), true);
echo $r["ok"] ? implode("\\n", $r["order"]["items"]) : $r["error"];`,
                ],
              ]}
            />
          </Section>

          <Section id="instructions" icon="📜" title="Instructions & Terms">
            <ul className="list-disc space-y-1 pl-5">
              <li>All products are sold as QORIX products. Resell them under your own brand at your own price.</li>
              <li>Balance is prepaid and used only for orders. Failed deliveries are refunded to balance automatically.</li>
              <li>Pass the product instructions to your buyer; warranty follows the product description.</li>
              <li>Do not share your API key. Abuse or chargebacks can disable the account.</li>
            </ul>
          </Section>

          <Section id="faq" icon="❓" title="FAQ">
            {[
              ["Where do I get an API key?", "Apply in the reseller portal. After approval the key is in your Reseller Dashboard."],
              ["How do I add balance?", "Top up from the Reseller Dashboard or with a deposit in the Telegram bot — it is the same balance."],
              ["The order said pending. Was I charged?", "Yes, the order is paid. Poll GET /orders/{id}; if it fails you are refunded automatically."],
              ["I got “Product temporarily unavailable”.", "That product cannot be sold right now. You were not charged (or were refunded). Try later or choose another product."],
              ["Why do I get 404 on every request?", "Check the base URL: no www, keep /v1, no trailing slash."],
            ].map(([q, a]) => (
              <details key={q} className="group rounded-xl border border-border/70 bg-card p-4">
                <summary className="cursor-pointer list-none font-semibold text-foreground">{q}</summary>
                <p className="mt-2">{a}</p>
              </details>
            ))}
          </Section>

          <Section id="changelog" icon="🗒️" title="Changelog">
            <ul className="space-y-2">
              <li><b className="text-foreground">v1.2</b> — Buyer email accepted as <C>customer_inputs.email</C>; unavailable deliveries now return “Product temporarily unavailable”. New step-by-step docs.</li>
              <li><b className="text-foreground">v1.1</b> — Unit prices with up to 4 decimals.</li>
              <li><b className="text-foreground">v1.0</b> — Products, orders, balance and transactions.</li>
            </ul>
          </Section>

          <Section id="support" icon="💬" title="Support">
            <p>Questions or a stuck order? Contact QORIX support from the Telegram bot and include your <C>order.id</C> or <C>external_ref</C>.</p>
            <div className="grid gap-2 sm:flex">
              <Button asChild><Link to="/reseller/start">Open Reseller Dashboard</Link></Button>
              <Button asChild variant="outline"><Link to="/reseller">Reseller portal</Link></Button>
            </div>
          </Section>
        </div>
      </div>
    </StoreShell>
  );
}
