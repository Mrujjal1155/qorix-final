/* Pure helper: products that share the same name get a short note that tells
   them apart (option number, price, warranty, stock). Never hides anything. */
type P = { id: string; name: string; price: number | string; delivery_time?: string | null; in_stock?: boolean; stock?: number | null };

export function duplicateNotes(products: P[]): Map<string, string> {
  const groups = new Map<string, P[]>();
  for (const p of products) {
    const key = String(p.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  const out = new Map<string, string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => Number(a.price) - Number(b.price));
    sorted.forEach((p, i) => {
      const parts = [`Option ${i + 1} of ${sorted.length}`, `$${Number(p.price).toFixed(2)}`];
      parts.push(p.delivery_time?.trim() ? p.delivery_time.trim() : "Warranty: see details");
      parts.push(p.in_stock === false ? "Out of stock" : "In stock");
      out.set(String(p.id), parts.join(" · "));
    });
  }
  return out;
}
