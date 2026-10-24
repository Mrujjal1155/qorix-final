/**
 * Patch written to an EXISTING supplier-linked product during a sync.
 *
 * Business rule: a sync may update only stock, price and flash state —
 * the admin's texts (name, description, important note, quick guide,
 * image, detail rows) are never overwritten, so edits made in the bot
 * admin survive every supplier run.
 */
export function existingProductSyncPatch(input: {
  price: number;
  stock: number;
  supplierEnabled: boolean;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    price: input.price,
    supplier_stock: input.stock,
  };
  // On/off is the admin's decision — a sync must never switch a product
  // back on. Disabling the whole supplier still takes its products off sale.
  if (!input.supplierEnabled) patch["is_active"] = false;
  return patch;
}
