/**
 * Read-only product lookup used by the Telegram AI assistant.
 *
 * The AI never touches the database directly — it only ever receives the rows
 * this module returns, which come from the existing `products` / `categories`
 * tables and the existing stock sources (`stock_counts` for in-house auto
 * items, `supplier_stock` for supplier-linked items).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

export type ProductHit = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  price: number;
  old_price: number | null;
  delivery_time: string | null;
  delivery_type: string;
  badge: string | null;
  note: string | null;
  details: Record<string, unknown> | null;
  available: number | null; // null = manual delivery (no counted stock)
  in_stock: boolean;
};

/** Bengali / common spellings → the English word stored in `products.name`. */
const ALIASES: Record<string, string> = {
  জেমিনি: "gemini",
  জিমিনি: "gemini",
  লাভেবল: "lovable",
  লাভএবল: "lovable",
  চ্যাটজিপিটি: "chatgpt",
  চ্যাট: "chat",
  জিপিটি: "gpt",
  কারসার: "cursor",
  কার্সার: "cursor",
  ক্যানভা: "canva",
  নেটফ্লিক্স: "netflix",
  স্পটিফাই: "spotify",
  ইউটিউব: "youtube",
  নরড: "nord",
  ভিপিএন: "vpn",
  নোশন: "notion",
  পারপ্লেক্সিটি: "perplexity",
  গ্রক: "grok",
  ক্লড: "claude",
  মিডজার্নি: "midjourney",
  ক্যাপকাট: "capcut",
  ডিসকর্ড: "discord",
  লিংকডইন: "linkedin",
  হটমেইল: "hotmail",
  আউটলুক: "outlook",
  রেপ্লিট: "replit",
  সুপাবেস: "supabase",
  ডুওলিঙ্গো: "duolingo",
  অফিস: "office",
  উইন্ডোজ: "windows",
};

/** Words that carry no product meaning — dropped before matching. */
const STOP = new Set([
  "কত","টাকা","দাম","আছে","কি","কী","কোন","একটা","একটি","ভাই","প্লিজ","price","cost","how","much","the","is","are","do","you","have","any","of","for","a","an","pro","plus","premium","please","koto","dam","ache",
]);

function normalise(q: string): string[] {
  const lowered = q.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ");
  const out: string[] = [];
  for (const raw of lowered.split(/\s+/)) {
    if (!raw) continue;
    const word = ALIASES[raw] ?? raw;
    if (STOP.has(word) || word.length < 2) continue;
    out.push(word);
  }
  return Array.from(new Set(out));
}

function score(name: string, category: string, tokens: string[]): number {
  const hay = `${name} ${category}`.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    if (hay.includes(t)) s += t.length >= 4 ? 3 : 2;
    else if (t.length >= 5 && hay.includes(t.slice(0, Math.ceil(t.length * 0.7)))) s += 1;
  }
  return s;
}

/**
 * Find the products that best match a free-text customer question.
 * Only active products are ever returned.
 */
export async function searchProducts(query: string, limit = 8): Promise<ProductHit[]> {
  const tokens = normalise(query);
  const { data, error } = await db
    .from("products")
    .select(
      "id,name,description,price,old_price,delivery_time,delivery_type,badge,important_note,details,supplier_id,supplier_stock,sort_order,categories!products_category_id_fkey(name)",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(600);
  if (error || !Array.isArray(data)) return [];

  const rows = data as any[];
  let picked: any[];
  if (!tokens.length) {
    picked = rows.slice(0, limit);
  } else {
    picked = rows
      .map((r) => ({ r, s: score(String(r.name ?? ""), String(r.categories?.name ?? ""), tokens) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || Number(a.r.sort_order ?? 0) - Number(b.r.sort_order ?? 0))
      .slice(0, limit)
      .map((x) => x.r);
  }
  if (!picked.length) return [];

  // Stock, exactly the way the rest of the bot counts it.
  const autoIds = picked.filter((p) => !p.supplier_id && p.delivery_type === "auto").map((p) => String(p.id));
  const counts: Record<string, number> = {};
  if (autoIds.length) {
    const { data: stock } = await db.rpc("stock_counts", { _product_ids: autoIds });
    for (const s of (stock ?? []) as any[]) counts[String(s.product_id)] = Number(s.available ?? 0);
  }

  return picked.map((p) => {
    const manual = p.delivery_type === "manual";
    const available = manual ? null : p.supplier_id ? Number(p.supplier_stock ?? 0) : (counts[String(p.id)] ?? 0);
    return {
      id: String(p.id),
      name: String(p.name ?? ""),
      category: p.categories?.name ? String(p.categories.name) : null,
      description: p.description ? String(p.description) : null,
      price: Number(p.price ?? 0),
      old_price: p.old_price == null ? null : Number(p.old_price),
      delivery_time: p.delivery_time ? String(p.delivery_time) : null,
      delivery_type: String(p.delivery_type ?? "auto"),
      badge: p.badge ? String(p.badge) : null,
      note: p.important_note ? String(p.important_note) : null,
      details: p.details && typeof p.details === "object" ? (p.details as Record<string, unknown>) : null,
      available,
      in_stock: manual ? true : (available ?? 0) > 0,
    };
  });
}

/** Active categories, for "কোন কোন AI tool আছে?"-style questions. */
export async function listCategories(): Promise<string[]> {
  const { data } = await db
    .from("categories")
    .select("name,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(60);
  return ((data ?? []) as any[]).map((c) => String(c.name));
}
