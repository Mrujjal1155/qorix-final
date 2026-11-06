import { createFileRoute } from "@tanstack/react-router";
import { PRODUCTION_SITE_URL } from "@/lib/site-url";

/** Public, indexable static pages. Private areas (/admin, /account, /auth,
 *  /track, /reseller/start, /reseller/panel) are intentionally excluded. */
const STATIC_PATHS = [
  "/",
  "/store",
  "/about",
  "/contact",
  "/faq",
  "/reseller",
  "/reseller/docs",
  "/terms",
  "/privacy",
  "/refund",
];

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

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function buildSitemap() {
  // Core pages have no authoritative per-page edit date, so they carry no <lastmod>.
  const urls: { loc: string; lastmod?: string }[] = STATIC_PATHS.map((p) => ({ loc: `${PRODUCTION_SITE_URL}${p}` }));

  try {
    const sb = await anonSupabase();
    const { publicProducts } = await import("@/lib/public-products.server");
    const [{ data: cats }, { data: prods }] = await Promise.all([
      sb.from("categories").select("id,channel").eq("is_active", true),
      publicProducts().select("id,category_id,updated_at").eq("is_active", true).limit(5000),
    ]);
    const { currentSlugs } = await import("@/lib/product-slugs.server");
    const slugs = await currentSlugs((prods ?? []).map((p: any) => String(p.id)));
    const allowed = new Set((cats ?? []).filter((c: any) => c.channel !== "telegram").map((c: any) => c.id));
    for (const p of prods ?? []) {
      const anyP = p as any;
      if (anyP.category_id && !allowed.has(anyP.category_id)) continue;
      const lastmod = anyP.updated_at ? new Date(anyP.updated_at).toISOString().slice(0, 10) : undefined;
      urls.push({ loc: `${PRODUCTION_SITE_URL}/store/${slugs[anyP.id] ?? anyP.id}`, ...(lastmod ? { lastmod } : {}) });
    }
  } catch {
    /* database unavailable — still serve the static portion */
  }

  const body = urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(await buildSitemap(), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
