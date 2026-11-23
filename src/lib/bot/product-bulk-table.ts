import { applyTier, cleanTiers, flashActive, type BulkTier } from "@/lib/bulk-discount";

type ProductPrice = { price: number; _public_price?: number; flash_ends_at?: string | null };

/** Display the existing checkout's cheapest matching tier, without stacking special prices. */
export function productBulkRows(product: ProductPrice, tiers: BulkTier[]) {
  if (flashActive(product)) return [];
  const base = Number(product._public_price ?? product.price);
  const thresholds = [...new Set(cleanTiers(tiers).map(tier => tier.min_qty))];
  return thresholds.map(min_qty => {
    let unit = base;
    for (const tier of cleanTiers(tiers)) {
      if (min_qty >= tier.min_qty) unit = Math.min(unit, applyTier(base, tier));
    }
    unit = Math.min(unit, Number(product.price));
    return { min_qty, unit };
  }).filter(row => row.unit > 0 && row.unit < Number(product.price)).slice(0, 10);
}

/** Short native Telegram table; configured badge HTML is already trusted/escaped by the caller. */
export function productBulkTable(product: ProductPrice, tiers: BulkTier[], badge: string): string {
  const rows = productBulkRows(product, tiers);
  if (!rows.length) return "";
  return `${badge} <b>Bulk discount</b>\n` +
    `<table bordered striped compact><tr><td><b>Quantity</b></td><td align="right"><b>Per piece</b></td></tr>` +
    rows.map(row => `<tr><td>${row.min_qty}+ pcs</td><td align="right">$${row.unit.toFixed(2)}</td></tr>`).join("") +
    `</table>\n`;
}

/** Convert newlines to <br/> outside <table> blocks so rich layout keeps paragraphs. */
export function keepRichLineBreaks(html: string): string {
  return html.split(/(<table[\s\S]*?<\/table>)/).map(part =>
    part.startsWith("<table") ? part : part.replace(/\n/g, "<br/>")).join("");
}
