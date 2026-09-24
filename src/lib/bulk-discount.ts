// Pure bulk-discount maths, shared by bot, API and admin preview.

export type BulkTier = { min_qty: number; type: "percent" | "flat"; value: number };
export type BulkRule = { id: string; name: string; product_ids: string[]; channel: string; tiers: BulkTier[]; is_active: boolean };

export function cleanTiers(raw: unknown): BulkTier[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((t: any) => ({
      min_qty: Math.max(1, Math.floor(Number(t?.min_qty) || 0)),
      type: t?.type === "flat" ? ("flat" as const) : ("percent" as const),
      value: Math.max(0, Number(t?.value) || 0),
    }))
    .filter((t) => t.min_qty >= 1 && t.value > 0 && (t.type === "flat" || t.value < 100))
    .sort((a, b) => a.min_qty - b.min_qty);
}

export function flashActive(p: any) {
  return Boolean(p?.flash_ends_at && Date.parse(String(p.flash_ends_at)) > Date.now());
}

/** Best tier for this quantity (highest min_qty that qty reaches). */
export function tierFor(tiers: BulkTier[], qty: number): BulkTier | null {
  let best: BulkTier | null = null;
  for (const t of tiers) if (qty >= t.min_qty) best = t;
  return best;
}

/** Discounted unit price; never below $0.01. */
export function applyTier(unit: number, tier: BulkTier | null) {
  if (!tier || unit <= 0) return unit;
  const next = tier.type === "flat" ? unit - tier.value : unit * (1 - tier.value / 100);
  return Math.max(0.01, Math.round(next * 100) / 100);
}
