/** One stock rule for the product UI, product cards and JSON-LD offers. */
export type StockInput = {
  delivery_type?: string | null;
  instant?: boolean | null;
  manual_stock_limited?: boolean | null;
  stock?: number | string | null;
};

/** Counted stock applies to auto-delivery, supplier (instant) and limited manual products. */
export function isStockCounted(p: StockInput): boolean {
  return p.delivery_type === "auto" || p.instant === true || p.manual_stock_limited === true;
}

export function productInStock(p: StockInput): boolean {
  return isStockCounted(p) ? Number(p.stock ?? 0) > 0 : true;
}
