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
  const urls: string[] = STATIC_PATHS.map((p) => `${PRODUCTION_SITE_URL}${p === "/" ? "/" : p}`);

  try {
    const sb = await anonSupabase();
    const [{ data: cats }, { data: prods }] = await Promise.all([
      sb.from("categories").select("id,channel").eq("is_active", true),
      sb.from("products").select("id,category_id").eq("is_active", true).limit(5000),
    ]);
    const allowed = new Set((cats ?? []).filter((c: any) => c.channel !== "telegram").map((c: any) => c.id));
    for (const p of prods ?? []) {
      const anyP = p as any;
      if (anyP.category_id && !allowed.has(anyP.category_id)) continue;
      urls.push(`${PRODUCTION_SITE_URL}/store/${anyP.id}`);
    }
  } catch {
    /* database unavailable — still serve the static portion */
  }

  const body = urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n");
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
