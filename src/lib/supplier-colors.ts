import type { CSSProperties } from "react";

/**
 * Supplier/reseller chips keep one hue per name so the same supplier always
 * reads the same colour on every admin screen (orders, products, top products).
 */
const SUPPLIER_HUES = [18, 145, 255, 320, 75, 195, 285, 45, 225, 350] as const;

export function supplierBadgeStyle(index: number): CSSProperties {
  const h = SUPPLIER_HUES[index % SUPPLIER_HUES.length];
  return {
    color: `oklch(0.72 0.16 ${h})`,
    borderColor: `oklch(0.72 0.16 ${h} / 0.55)`,
    backgroundColor: `oklch(0.72 0.16 ${h} / 0.12)`,
  };
}

/** Reseller chips are filled in more heavily so they catch the eye in a long list. */
export function resellerBadgeStyle(index: number): CSSProperties {
  const h = SUPPLIER_HUES[(index + 3) % SUPPLIER_HUES.length];
  return {
    color: `oklch(0.85 0.13 ${h})`,
    borderColor: `oklch(0.72 0.15 ${h} / 0.7)`,
    backgroundColor: `oklch(0.58 0.17 ${h} / 0.28)`,
  };
}

/**
 * Stable name → colour index: names are de-duplicated and sorted, so the
 * mapping does not depend on row order or on which page is currently visible.
 */
export function colorIndexesFor(names: Array<string | null | undefined>): Map<string, number> {
  const unique = Array.from(new Set(names.map((n) => String(n ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
  return new Map(unique.map((name, index) => [name, index]));
}
