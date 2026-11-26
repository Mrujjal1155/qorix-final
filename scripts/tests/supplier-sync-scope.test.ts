import { describe, it, expect } from "vitest";
import { shouldSyncSupplierItem } from "../../src/lib/suppliers/sync-scope";
const active = new Set(["p1"]); const watched = new Set(["sp9"]);
describe("supplier sync scope", () => {
  it("syncs a listed item linked to an active product", () => { expect(shouldSyncSupplierItem({ id: "sp1", is_listed: true, product_id: "p1" }, active, watched)).toBe(true); });
  it("skips a listed item whose product is inactive", () => { expect(shouldSyncSupplierItem({ id: "sp2", is_listed: true, product_id: "p2" }, active, watched)).toBe(false); });
  it("skips unlisted catalogue items", () => { expect(shouldSyncSupplierItem({ id: "sp3", is_listed: false, product_id: null }, active, watched)).toBe(false); });
  it("skips brand-new supplier items", () => { expect(shouldSyncSupplierItem(undefined, active, watched)).toBe(false); });
  it("keeps Buy-Order-watched items in sync", () => { expect(shouldSyncSupplierItem({ id: "sp9", is_listed: false, product_id: null }, active, watched)).toBe(true); });
});
