// Read-only product lookup for the n8n automation layer.
//
// n8n never touches Supabase directly: it calls the endpoints under
// /api/public/n8n/* with a shared key, and this module returns a safe,
// projected view of the catalogue (no costs, no supplier internals, no PII).

import { supabaseAdmin as db } from "@/integrations/supabase/client.server";

/** Shared key: Cloudflare/Lovable secret first, admin-editable setting second. */
export async function n8nKeyOk(request: Request): Promise<boolean> {
  const provided =
    request.headers.get("X-N8N-Key") ??
    request.headers.get("x-n8n-key") ??
    (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!provided) return false;

  const envKey = process.env["N8N_API_KEY"];
  if (envKey && provided === envKey) return true;

  const { data } = await db.from("bot_settings").select("value").eq("key", "n8n_api_key").maybeSingle();
  const settingKey = ((data as any)?.value ?? "").trim();
  return Boolean(settingKey) && provided === settingKey;
}

export type N8nProduct = {
  id: string;
  name: string;
  emoji: string | null;
  category: string | null;
  price: number;
  old_price: number | null;
  currency: "BDT";
  duration: string | null;
  description: string | null;
  important_note: string | null;
  in_stock: boolean;
  stock: number;
  delivery: string;
  bot_link: string | null;
};

function norm(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Search the live catalogue. An empty query returns the top listed products.
 * Only products that a customer could actually see in the bot are returned.
 */
export async function searchProducts(query: string, limit = 8): Promise<N8nProduct[]> {
  const [{ data: products }, { data: categories }, { data: settings }] = await Promise.all([
    db
      .from("products")
      .select(
        "id,name,emoji,price,old_price,description,important_note,delivery_time,delivery_type,supplier_id,supplier_stock,category_id,sort_order,is_active,owner_reseller_id",
      )
      .eq("is_active", true)
      .is("owner_reseller_id", null)
      .order("sort_order", { ascending: true })
      .limit(1000),
    db.from("categories").select("id,name"),
    db.from("bot_settings").select("value").eq("key", "bot_link").maybeSingle(),
  ]);

  const { guardVisibleProducts } = await import("@/lib/suppliers/visibility-guard.server");
  const visible = guardVisibleProducts((products ?? []) as any[], "bot") as any[];

  const catName: Record<string, string> = {};
  for (const c of ((categories ?? []) as any[])) catName[String(c.id)] = String(c.name ?? "");

  const terms = norm(query).split(" ").filter(Boolean);
  const scored = visible
    .map((p) => {
      const haystack = norm(`${p.name ?? ""} ${catName[String(p.category_id)] ?? ""} ${p.description ?? ""}`);
      const name = norm(String(p.name ?? ""));
      if (!terms.length) return { p, score: 1 };
      let score = 0;
      for (const t of terms) {
        if (name.includes(t)) score += 3;
        else if (haystack.includes(t)) score += 1;
      }
      return { p, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.p.sort_order ?? 0) - Number(b.p.sort_order ?? 0))
    .slice(0, Math.min(Math.max(limit, 1), 25));

  // Exact availability for in-house auto products; supplier items use their snapshot.
  const autoIds = scored.filter((r) => !r.p.supplier_id && r.p.delivery_type === "auto").map((r) => String(r.p.id));
  const counts: Record<string, number> = {};
  if (autoIds.length) {
    const { data: stock } = await db.rpc("stock_counts", { _product_ids: autoIds } as any);
    for (const s of ((stock ?? []) as any[])) counts[String(s.product_id)] = Number(s.available ?? 0);
  }

  const botLink = ((settings as any)?.value ?? "").trim() || null;

  return scored.map(({ p }) => {
    const manual = p.delivery_type === "manual";
    const stock = manual ? 0 : p.supplier_id ? Number(p.supplier_stock ?? 0) : (counts[String(p.id)] ?? 0);
    return {
      id: String(p.id),
      name: String(p.name ?? ""),
      emoji: p.emoji ?? null,
      category: catName[String(p.category_id)] ?? null,
      price: Number(p.price ?? 0),
      old_price: p.old_price == null ? null : Number(p.old_price),
      currency: "BDT" as const,
      duration: p.delivery_time ?? null,
      description: p.description ?? null,
      important_note: p.important_note ?? null,
      in_stock: manual ? true : stock > 0,
      stock,
      delivery: manual ? "manual" : "instant",
      bot_link: botLink ? `${botLink}?start=p_${String(p.id)}` : null,
    };
  });
}
