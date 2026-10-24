import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { existingProductSyncPatch } from "../../src/lib/suppliers/sync-patch";

describe("Supplier sync writes stock-only patches for existing products", () => {
  test("patch carries only stock and price; a disabled supplier takes the product off sale", () => {
    expect(existingProductSyncPatch({ price: 3.2, stock: 7, supplierEnabled: true })).toEqual({
      price: 3.2,
      supplier_stock: 7,
    });
    expect(existingProductSyncPatch({ price: 3.2, stock: 0, supplierEnabled: false })).toEqual({
      price: 3.2,
      supplier_stock: 0,
      is_active: false,
    });
  });

  test("patch never carries supplier texts — admin edits survive every sync", () => {
    const patch = existingProductSyncPatch({ price: 1, stock: 1, supplierEnabled: true });
    for (const key of ["name", "description", "important_note", "quick_guide", "details", "image_url", "delivery_time"]) {
      expect(Object.keys(patch)).not.toContain(key);
    }
  });

  test("sync source builds the patch through the builder instead of overwriting texts inline", () => {
    const source = readFileSync(new URL("../../src/lib/suppliers/sync.server.ts", import.meta.url), "utf8");
    expect(source).toContain("existingProductSyncPatch({");
    const block = source.slice(
      source.indexOf("existingProductSyncPatch({"),
      source.indexOf("productUpdates.push"),
    );
    for (const forbidden of ["name:", "description:", "important_note", "quick_guide", "image_url", "details ="]) {
      expect(block).not.toContain(forbidden);
    }
  });
});
