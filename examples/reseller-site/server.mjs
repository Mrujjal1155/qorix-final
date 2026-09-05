/**
 * QORIX reseller starter storefront — zero dependency Node server.
 *
 * চালাতে:  cp .env.example .env  →  key বসান  →  npm start  →  http://localhost:3000
 *
 * নিয়ম: API key শুধু এই সার্ভার ফাইলেই থাকবে, কখনো ব্রাউজারে নয়।
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const API = process.env.QORIX_API || "https://qorixlab.com/api/public/reseller/v1";
const KEY = process.env.QORIX_KEY || "";
const MARKUP = Number(process.env.MARKUP || 1.25);
const PORT = Number(process.env.PORT || 3000);

if (!KEY) {
  console.error("QORIX_KEY missing — .env ফাইলে আপনার reseller API key বসান।");
  process.exit(1);
}

/** সব API কল এই একটি হেল্পার দিয়ে যায়। */
async function qorix(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || `API error ${res.status}`);
  }
  return body;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sell = (price) => (Number(price) * MARKUP).toFixed(2);

function page(title, body) {
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
 body{font-family:system-ui,sans-serif;margin:0;background:#0b0f17;color:#e7ecf3}
 .wrap{max-width:960px;margin:0 auto;padding:32px 16px}
 a{color:#7dd3fc} .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
 .card{background:#141a26;border:1px solid #23304a;border-radius:14px;padding:16px}
 .price{font-size:22px;font-weight:700;margin:8px 0}
 button,input{font:inherit} button{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:10px 16px;cursor:pointer}
 input{width:100%;padding:10px;border-radius:10px;border:1px solid #23304a;background:#0b0f17;color:#e7ecf3;margin:6px 0}
 code{background:#0b0f17;padding:2px 6px;border-radius:6px}
 pre{background:#0b0f17;border:1px solid #23304a;border-radius:10px;padding:14px;overflow:auto}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

async function homePage() {
  const { products } = await qorix("/products?channel=website");
  const cards = products
    .map(
      (p) => `<div class="card">
        <h3>${esc(p.name)}</h3>
        <div class="price">$${sell(p.price)}</div>
        <div style="opacity:.7;font-size:13px">${p.stock === null ? "In stock" : `Stock: ${p.stock}`}</div>
        <form method="POST" action="/buy">
          <input type="hidden" name="product_id" value="${esc(p.id)}">
          <input name="email" type="email" placeholder="আপনার ইমেইল" required>
          <button type="submit">Buy now</button>
        </form>
      </div>`,
    )
    .join("");
  return page("My Store", `<h1>My Store</h1><p>QORIX reseller API দিয়ে চালিত।</p><div class="grid">${cards}</div>`);
}

async function buy(form) {
  // external_ref = আপনার নিজের অর্ডার আইডি। একই ref দুইবার পাঠালে ডাবল চার্জ হবে না।
  const out = await qorix("/orders", {
    method: "POST",
    body: JSON.stringify({
      product_id: form.get("product_id"),
      quantity: 1,
      external_ref: randomUUID(),
      customer_email: form.get("email"),
      channel: "website",
    }),
  });
  const items = (out.order.items || []).map((i) => esc(i)).join("\n");
  return page(
    "Order complete",
    `<h1>ধন্যবাদ!</h1>
     <p>Order #${out.order.order_no} — ${esc(out.order.product_name)} — status: <b>${esc(out.order.status)}</b></p>
     ${items ? `<h3>আপনার ডেলিভারি</h3><pre>${items}</pre>` : "<p>ম্যানুয়াল ডেলিভারি — কিছুক্ষণের মধ্যে ইমেইলে পাঠানো হবে।</p>"}
     <p>বাকি ব্যালেন্স (reseller): $${out.balance ?? "-"}</p><p><a href="/">← আরও কিনুন</a></p>`,
  );
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(await homePage());
      }
      if (req.method === "POST" && req.url === "/buy") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(await buy(new URLSearchParams(raw)));
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
    } catch (err) {
      res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
      res.end(page("Error", `<h1>দুঃখিত</h1><p>${esc(err.message)}</p><p><a href="/">← ফিরে যান</a></p>`));
    }
  })
  .listen(PORT, () => console.log(`Storefront ready → http://localhost:${PORT}`));
