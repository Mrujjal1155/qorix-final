/**
 * Supplier sync scope: only supplier items the shop actually sells (listed,
 * linked to an active store product) or that an admin Buy Order is watching
 * are counted and saved. Everything else in a supplier's catalogue is ignored,
 * so inactive/unsold items never cost database work.
 */
export function shouldSyncSupplierItem(
  prev: { id?: unknown; is_listed?: unknown; product_id?: unknown } | undefined,
  activeProductIds: ReadonlySet<string>,
  watchedSupplierProductIds: ReadonlySet<string>,
): boolean {
  if (!prev) return false;
  if (prev.id != null && watchedSupplierProductIds.has(String(prev.id))) return true;
  return prev.is_listed === true && prev.product_id != null && activeProductIds.has(String(prev.product_id));
}
