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
  it("puts stocked categories and plans first while preserving serial inside each group", () => {
    const entries = simpleShopEntries([{ id: "empty", name: "Empty" }, { id: "c", name: "Plans" }, { id: "out", name: "Sold" }], [
      { id: "sold-a", name: "Sold A", category_id: "c", price: 2, stock: 0 },
      { id: "ready", name: "Ready", category_id: "c", price: 3, stock: 2 },
      { id: "sold-b", name: "Sold B", category_id: "out", price: 1, stock: 0 },
    ], {});
    expect(entries.map(entry => entry.category.id)).toEqual(["c", "empty", "out"]);
    expect(entries[0]?.plans.map(plan => plan.id)).toEqual(["ready", "sold-a"]);
    expect(entries[0]?.style).toBe("primary");
    expect(entries[1]?.style).toBe("danger");
    expect(entries[2]?.style).toBe("danger");
  });
  it("does not mark unlimited manual plans sold out", () => {
    const p = { id: "a", name: "Manual", price: 3, delivery_type: "manual", stock: 0 };
    expect(simplePlanStock(p)).toBe("Unlimited");
    expect(simpleShopEntries([{ id: "c", name: "Manual" }], [p], { c: new Set(["a"]) })[0]?.style).toBe("success");
  });
});