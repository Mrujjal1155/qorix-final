import { describe, expect, it } from "vitest";
import { chunk, paginateRows, pickTopCategories } from "../../src/lib/bot/shop-layout";
describe("shop layout", () => {
  it("top categories two per row", () => { expect(chunk([1,2,3], 2)).toEqual([[1,2],[3]]); });
  it("never exceeds 100 buttons per page", () => {
    const rows = Array.from({ length: 60 }, () => [1, 2, 3]);
    const r0 = paginateRows(rows, 7, 0);
    expect(r0.rows.flat().length + 7).toBeLessThanOrEqual(100);
    expect(r0.pages).toBe(2);
    expect(paginateRows(rows, 7, 1).rows.flat().length).toBe(180 - r0.rows.flat().length);
  });
  it("splits pages when markup grows too large", () => {
    const big = { text: "x".repeat(60), callback_data: "p:" + "a".repeat(36), icon_custom_emoji_id: "5".repeat(19) };
    const rows = Array.from({ length: 80 }, () => [big]);
    const r0 = paginateRows(rows, 7, 0);
    expect(JSON.stringify(r0.rows).length).toBeLessThanOrEqual(6000);
    expect(r0.pages).toBeGreaterThan(1);
  });
  it("keeps admin order and drops missing", () => {
    expect(pickTopCategories([{ id: "a" }, { id: "b" }], ["b", "x", "a"]).map((c) => c.id)).toEqual(["b", "a"]);
  });
});
