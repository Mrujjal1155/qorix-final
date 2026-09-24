import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyTier, cleanTiers, flashActive, tierFor, type BulkTier } from "@/lib/bulk-discount";

const db = supabaseAdmin as any;

/** Active tiers per product for a channel ("bot" | "api"). Never throws. */
export async function bulkTiersFor(productIds: string[], channel: "bot" | "api") {
  const out: Record<string, BulkTier[]> = {};
  if (!productIds.length) return out;
  try {
    const { data } = await db
      .from("bulk_discounts")
      .select("product_ids,channel,tiers")
      .eq("is_active", true)
      .in("channel", [channel, "both"])
      .overlaps("product_ids", productIds);
    for (const r of (data ?? []) as any[]) {
      const tiers = cleanTiers(r.tiers);
      for (const id of r.product_ids ?? []) {
        if (!productIds.includes(id) || !tiers.length) continue;
        // If several rules hit one product, keep the one giving more discount at its top tier.
        out[id] = out[id] ? [...out[id], ...tiers].sort((a, b) => a.min_qty - b.min_qty) : tiers;
      }
    }
  } catch (e) {
    console.error("bulk discount lookup failed", e);
  }
  return out;
}

/** Unit price after bulk discount. Off while the product is in a flash sale. */
export function bulkUnit(product: any, unit: number, qty: number, tiers: BulkTier[] | undefined) {
  if (!tiers?.length || flashActive(product)) return unit;
  // With overlapping rules pick the cheapest result.
  let best = unit;
  for (const t of tiers) if (qty >= t.min_qty) best = Math.min(best, applyTier(unit, t));
  return best;
}

export { tierFor };
