import { describe, it, expect } from "vitest";
import { shouldSyncSupplierItem } from "../../src/lib/suppliers/sync-scope";
const active = new Set(["p1"]);
describe("supplier sync scope", () => {
  it("syncs a listed item linked to an active product", () => { expect(shouldSyncSupplierItem({ id: "sp1", is_listed: true, product_id: "p1" }, active)).toBe(true); });
  it("skips a listed item whose product is inactive", () => { expect(shouldSyncSupplierItem({ id: "sp2", is_listed: true, product_id: "p2" }, active)).toBe(false); });
  it("skips unlisted catalogue items", () => { expect(shouldSyncSupplierItem({ id: "sp3", is_listed: false, product_id: null }, active)).toBe(false); });
  it("skips brand-new supplier items", () => { expect(shouldSyncSupplierItem(undefined, active)).toBe(false); });
  it("does not sync an inactive item even if a Buy Order watches it", () => { expect(shouldSyncSupplierItem({ id: "sp9", is_listed: false, product_id: null }, active)).toBe(false); });
});
