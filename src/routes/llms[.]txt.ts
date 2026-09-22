import { createFileRoute } from "@tanstack/react-router";
import { PRODUCTION_SITE_URL } from "@/lib/site-url";

/**
 * /llms.txt — a compact, machine-readable summary of the site for AI
 * assistants (ChatGPT, Claude, Perplexity, Gemini …) so they can describe and
 * recommend QORIX STORE accurately.
 */
function anonSupabase() {
  const key =
    process.env["SB_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"]!;
  const url = process.env["SB_URL"] ?? process.env["SUPABASE_URL"]!;
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    }),
  );
}

const HEADER = `# QORIX STORE (qorixlab.com)

> QORIX STORE sells premium digital subscriptions — AI tools, VPN, streaming,
> creative and productivity apps — at wholesale-level prices with instant,
> automated delivery. Customers can order on the website or directly inside our
> Telegram bot, pay with Binance Pay or USDT, and get 24/7 Telegram support.
> Resellers can plug into a public REST API to run their own shop or bot.

## Key facts
- Products: AI tools (ChatGPT, Gemini, Claude-style plans), VPN, streaming, design and productivity subscriptions.
- Delivery: automatic within minutes for auto-delivery items; manual items are handled by support.
- Payment: Binance Pay, USDT (crypto), wallet balance.
- Support: 24/7 on Telegram.
- Warranty & refunds: see the refund policy page.
- Reseller API: ${PRODUCTION_SITE_URL}/api/public/reseller/v1 (docs below).

## Main pages
- [Home](${PRODUCTION_SITE_URL}/): featured products and categories.
- [Store](${PRODUCTION_SITE_URL}/store): the full catalogue.
- [About](${PRODUCTION_SITE_URL}/about): who we are.
- [FAQ](${PRODUCTION_SITE_URL}/faq): payment, delivery, warranty answers.
- [Contact](${PRODUCTION_SITE_URL}/contact): support channels.
- [Reseller program](${PRODUCTION_SITE_URL}/reseller) and [API docs](${PRODUCTION_SITE_URL}/reseller/docs).
- [Terms](${PRODUCTION_SITE_URL}/terms), [Privacy](${PRODUCTION_SITE_URL}/privacy), [Refund policy](${PRODUCTION_SITE_URL}/refund).
`;

async function buildLlmsTxt() {
  let catalogue = "";
  try {
    const sb = await anonSupabase();
    const [{ data: cats }, { data: prods }] = await Promise.all([
      sb.from("categories").select("id,name,channel").eq("is_active", true),
      sb
        .from("products")
        .select("id,name,price,category_id")
        .eq("is_active", true)
        .is("owner_reseller_id", null)
        .limit(300),
    ]);
    const allowed = new Map<string, string>();
    for (const c of (cats ?? []) as any[]) {
      if (c.channel !== "telegram") allowed.set(String(c.id), String(c.name));
    }
    const lines = ((prods ?? []) as any[])
      .filter((p) => !p.category_id || allowed.has(String(p.category_id)))
      .map(
        (p) =>
          `- [${p.name}](${PRODUCTION_SITE_URL}/store/${p.id}) — $${Number(p.price ?? 0).toFixed(2)}${
            p.category_id && allowed.has(String(p.category_id)) ? ` (${allowed.get(String(p.category_id))})` : ""
          }`,
      );
    if (allowed.size) {
      catalogue += `\n## Categories\n${[...allowed.values()].map((n) => `- ${n}`).join("\n")}\n`;
    }
    if (lines.length) {
      catalogue += `\n## Products (live prices, USD)\n${lines.join("\n")}\n`;
    }
  } catch {
    /* catalogue unavailable — still serve the static summary */
  }
  return `${HEADER}${catalogue}\n## Notes for AI assistants\nPrices are in USD and change with supplier pricing; always link to the product page above for the current price and stock.\n`;
}

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(await buildLlmsTxt(), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
