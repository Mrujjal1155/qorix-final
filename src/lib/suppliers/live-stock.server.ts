// Live supplier stock reader.
//
// The stored `products.supplier_stock` is only a snapshot written by the
// scheduled sync. Whenever a buyer actually looks at (or buys) a supplier
// product we read the supplier API directly, so what we show is exactly what
// the supplier shows. It also self-heals the link when the supplier rotated
// the product id (match by name) so an order never fails on a dead id.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

type Cached = { at: number; items: any[] };
const catalogueCache = new Map<string, Cached>();
const CACHE_TTL_MS = 10_000;

function norm(name: unknown) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function catalogueFor(supplier: any): Promise<any[]> {
  const hit = catalogueCache.get(supplier.id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  const { supplierProducts } = await import("@/lib/suppliers/api.server");
  const items = await supplierProducts(supplier as any);
  catalogueCache.set(supplier.id, { at: Date.now(), items });
  return items;
}

export type LiveStock = {
  stock: number;
  external_id: string;
  price?: number | undefined;
  relinked: boolean;
};

/**
 * Read one product's live stock from its supplier.
 * Returns `null` when the product is not supplier-linked, the supplier is
 * disabled, or the API could not be reached in time (caller keeps the stored
 * snapshot in that case).
 */
export async function refreshLiveStock(productId: string, timeoutMs = 4500): Promise<LiveStock | null> {
  try {
    const { data: p } = await db
      .from("products")
      .select("id,name,supplier_id,supplier_external_id,supplier_stock")
      .eq("id", productId)
      .maybeSingle();
    if (!p?.supplier_id || !p.supplier_external_id) return null;

    const { data: supplier } = await db
      .from("suppliers")
      .select("*")
      .eq("id", p.supplier_id)
      .eq("is_enabled", true)
      .maybeSingle();
    if (!supplier) return null;

    const items = (await Promise.race([
      catalogueFor(supplier),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ])) as any[] | null;
    if (!items) return null;

    let match = items.find((i) => String(i.external_id) === String(p.supplier_external_id));
    let relinked = false;
    if (!match) {
      match = items.find((i) => norm(i.name) === norm(p.name));
      relinked = Boolean(match);
    }
    if (!match) return null;

    const stock = Math.max(0, Number(match.stock ?? 0));
    const externalId = String(match.external_id);

    const patch: Record<string, unknown> = { supplier_stock: stock };
    if (relinked) patch["supplier_external_id"] = externalId;
    if (stock !== Number(p.supplier_stock ?? 0) || relinked) {
      await Promise.all([
        db.from("products").update(patch).eq("id", p.id),
        db
          .from("supplier_products")
          .update({ stock, last_synced_at: new Date().toISOString() })
          .eq("supplier_id", supplier.id)
          .eq("external_id", externalId),
      ]);
    }

    return {
      stock,
      external_id: externalId,
      price: match.price != null ? Number(match.price) : undefined,
      relinked,
    };
  } catch (error) {
    console.error("[live-stock] refresh failed:", error);
    return null;
  }
}
