export type ReservedOrder = {
  id: string; product_id: string; quantity: number; unit_price: number; total: number;
  discount: number; product_name: string; status: string; meta: Record<string, unknown>;
};

/** Paid gateway checkouts use the original order prices, not the current catalogue. */
export function reservedCheckout(orders: ReservedOrder[], products: any[], items: { product_id: string; qty: number }[]) {
  const lines = orders.map((o) => {
    const product = products.find((p) => p.id === o.product_id);
    return { order: o, product, qty: Number(o.quantity), unit: Number(o.unit_price),
      subtotal: Number(o.total) + Number(o.discount || 0), custom: false };
  });
  const complete = orders.length > 0 && items.length === orders.length && items.every((item) =>
    orders.filter((o) => o.product_id === item.product_id && Number(o.quantity) === Number(item.qty)).length === 1);
  const blocked = !complete || lines.some((l) => !l.product || !l.product.is_active || l.qty < 1);
  return { lines, blocked, total: Math.round(orders.reduce((sum, o) => sum + Number(o.total), 0) * 100) / 100,
    discount: orders.reduce((sum, o) => sum + Number(o.discount || 0), 0) };
}