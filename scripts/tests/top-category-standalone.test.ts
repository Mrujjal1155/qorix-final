import { describe, expect, it } from "vitest";
import { inTopCategory, standaloneProducts, type TopCategory } from "../../src/lib/telegram-top-categories";
const gem: TopCategory = { id: "gemini", name: "G", keywords: ["gemini"], is_active: true };
describe("top category selection", () => {
  it("selected products override keywords", () => {
    const c = { ...gem, product_ids: ["11111111-1111-4111-8111-111111111111"] };
    expect(inTopCategory({ id: "11111111-1111-4111-8111-111111111111", name: "Canva" }, c)).toBe(true);
    expect(inTopCategory({ id: "x", name: "Gemini Pro" }, c)).toBe(false);
  });
  it("singles exclude top-category products, in-house before supplier", () => {
    const out = standaloneProducts([
      { id: "a", name: "Canva", supplier_id: "s" },
      { id: "b", name: "Gemini Pro", supplier_id: null },
      { id: "c", name: "Netflix", supplier_id: null },
    ], [gem]);
    expect(out.map((p) => p.id)).toEqual(["c", "a"]);
  });
});
