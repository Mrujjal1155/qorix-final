/**
 * Automatic supplier sync scope: only supplier items the shop actually sells
 * (listed and linked to an active store product) are counted and saved.
 * Inactive/unsold items are never touched; admin manual sync imports all.
 */
export function shouldSyncSupplierItem(
  prev: { is_listed?: unknown; product_id?: unknown } | undefined,
  activeProductIds: ReadonlySet<string>,
): boolean {
  if (!prev) return false;
  return prev.is_listed === true && prev.product_id != null && activeProductIds.has(String(prev.product_id));
}
