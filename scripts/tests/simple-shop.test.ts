import { describe, expect, it } from "vitest";
import { shopDesign, simpleShopEntries, simplePlanStock } from "../../src/lib/bot/simple-shop";
describe("Telegram Simple Shop", () => {
  it("defaults to Classic unless Simple is selected", () => {
    expect(shopDesign(undefined)).toBe("classic");
    expect(shopDesign("classic")).toBe("classic");
    expect(shopDesign("simple")).toBe("simple");
    expect(shopDesign("invalid")).toBe("classic");
  });
  it("keeps a single sold-out plan visible and red", () => {
    const entries = simpleShopEntries([{ id: "c", name: "Single" }], [{ id: "p", name: "Plan", category_id: "c", price: 2, stock: 0 }], {});
    expect(entries[0]?.plans.map(p => p.id)).toEqual(["p"]);
    expect(entries[0]?.style).toBe("danger");
  });
  it("aggregates multiple plans including linked rows without duplicates", () => {
    const entries = simpleShopEntries([{ id: "c", name: "Muse" }], [
      { id: "a", name: "Plan", category_id: "c", price: 0.18, stock: 100 },
      { id: "b", name: "Plan", price: 2.5, stock: 209 },
      { id: "out", name: "Sold", category_id: "c", price: 1, stock: 0 },
    ], { c: new Set(["a", "b"]) });
    expect(entries[0]?.plans.map(p => p.id)).toEqual(["a", "b", "out"]);
    expect(entries[0]?.minPrice).toBe(0.18);
    expect(entries[0]?.maxPrice).toBe(2.5);
    expect(entries[0]?.stock).toBe(309);
    expect(entries[0]?.style).toBe("primary");
  });
  it("keeps empty permitted categories", () => {
    expect(simpleShopEntries([{ id: "c", name: "Empty" }], [], {})[0]?.plans).toEqual([]);
  });
  it("does not mark unlimited manual plans sold out", () => {
    const p = { id: "a", name: "Manual", price: 3, delivery_type: "manual", stock: 0 };
    expect(simplePlanStock(p)).toBe("Unlimited");
    expect(simpleShopEntries([{ id: "c", name: "Manual" }], [p], { c: new Set(["a"]) })[0]?.style).toBe("success");
  });
});