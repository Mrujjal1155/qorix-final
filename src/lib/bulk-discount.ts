// Pure bulk-discount maths, shared by bot, API and admin preview.

export type BulkTier = { min_qty: number; type: "percent" | "flat"; value: number };
export type BulkRule = { id: string; name: string; product_ids: string[]; channel: string; tiers: BulkTier[]; is_active: boolean };

/** Active new setups always notify; edits retain the explicit resend switch. */
export function shouldAnnounceBulk(input: { id?: string | undefined; is_active: boolean; notify: boolean }) {
  return input.is_active && (!input.id || input.notify);
}

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

export type BulkTierRow = { min_qty: number; label: string; unit: number; save: number; save_percent: number };

/** Display rows for the product page: "5+", per-piece price and saving vs the base unit price. */
export function bulkTierRows(tiers: BulkTier[], unit: number): BulkTierRow[] {
  const base = Math.max(0, Number(unit) || 0);
  const seen = new Set<number>();
  const rows: BulkTierRow[] = [];
  for (const t of cleanTiers(tiers)) {
    if (seen.has(t.min_qty)) continue;
    seen.add(t.min_qty);
    const price = applyTier(base, t);
    const save = Math.max(0, Math.round((base - price) * 100) / 100);
    rows.push({
      min_qty: t.min_qty,
      label: `${t.min_qty}+`,
      unit: price,
      save,
      save_percent: base > 0 ? Math.round((save / base) * 100) : 0,
    });
  }
  return rows.filter((r) => r.save > 0).slice(0, 10);
}

/** Effective per-piece price for a quantity from display rows (cheapest matching tier wins). */
export function bulkUnitFromRows(rows: BulkTierRow[], qty: number, base: number): number {
  const unit = Math.max(0, Number(base) || 0);
  let best = unit;
  for (const r of rows) {
    if (qty >= r.min_qty && r.unit > 0 && r.unit < best) best = r.unit;
  }
  return best;
}
