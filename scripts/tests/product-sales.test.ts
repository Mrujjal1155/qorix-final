import { describe, expect, it } from "vitest";
import { dhakaDay, summarizeSales } from "../../src/lib/product-sales";

describe("product sales summary", () => {
  it("uses Bangladesh day boundaries", () => {
    expect(dhakaDay("2026-10-26T18:30:00Z")).toBe("2026-10-27");
  });
  it("counts today, 7 and 30 days by quantity", () => {
    const now = new Date("2026-10-27T06:00:00Z");
    const s = summarizeSales([
      { created_at: "2026-10-27T01:00:00Z", quantity: 2, total: 3, source: "bot" },
      { created_at: "2026-10-22T01:00:00Z", quantity: 1, total: 1.5, source: "bot" },
      { created_at: "2026-10-01T01:00:00Z", quantity: 4, total: 6, source: "bot" },
      { created_at: "2026-08-01T01:00:00Z", quantity: 5, total: 7, source: "bot" },
    ], now);
    expect(s.today.qty).toBe(2);
    expect(s.last7.qty).toBe(3);
    expect(s.last30.qty).toBe(7);
    expect(s.all.qty).toBe(12);
  });
});
