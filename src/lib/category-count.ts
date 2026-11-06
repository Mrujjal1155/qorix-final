/** One definition of "a category" for every public count:
 *  an active category that holds at least one listed product, counting every
 *  category a product belongs to (category_ids), not only its primary one. */
export function productCategoryIds(p: { category_id?: string | null; category_ids?: string[] | null }): string[] {
  return p.category_ids?.length ? p.category_ids : p.category_id ? [p.category_id] : [];
}

export function categoriesWithProducts<C extends { id: string }>(
  categories: C[],
  products: Array<{ category_id?: string | null; category_ids?: string[] | null }>,
): Array<C & { n: number }> {
  const counts = new Map<string, number>();
  for (const p of products) for (const id of productCategoryIds(p)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return categories.map((c) => ({ ...c, n: counts.get(c.id) ?? 0 })).filter((c) => c.n > 0);
}
