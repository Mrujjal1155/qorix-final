import { describe, expect, it } from "vitest";
import { bulkTierRows, bulkUnitFromRows } from "@/lib/bulk-discount";

describe("bulkTierRows", () => {
  it("computes per-piece prices and savings for percent tiers", () => {
    const rows = bulkTierRows([
      { min_qty: 5, type: "percent", value: 10 },
      { min_qty: 10, type: "percent", value: 20 },
    ], 2);
    expect(rows).toEqual([
      { min_qty: 5, label: "5+", unit: 1.8, save: 0.2, save_percent: 10 },
      { min_qty: 10, label: "10+", unit: 1.6, save: 0.4, save_percent: 20 },
    ]);
  });

  it("supports flat tiers and sorts by quantity", () => {
    const rows = bulkTierRows([
      { min_qty: 15, type: "flat", value: 0.5 },
      { min_qty: 5, type: "flat", value: 0.2 },
    ], 3);
    expect(rows.map((r) => r.min_qty)).toEqual([5, 15]);
    expect(rows[0]?.unit).toBe(2.8);
    expect(rows[1]?.unit).toBe(2.5);
  });

  it("drops duplicate quantities and zero-value tiers; qty 0 normalizes to 1 (cleanTiers rule)", () => {
    const rows = bulkTierRows([
      { min_qty: 5, type: "percent", value: 10 },
      { min_qty: 5, type: "percent", value: 30 },
      { min_qty: 0, type: "percent", value: 50 },
      { min_qty: 8, type: "percent", value: 0 },
    ], 2);
    expect(rows.map((r) => r.min_qty)).toEqual([1, 5]);
    expect(rows[1]?.unit).toBe(1.8);
  });

  it("never returns a per-piece price below $0.01", () => {
    const rows = bulkTierRows([{ min_qty: 10, type: "flat", value: 99 }], 1);
    expect(rows[0]?.unit).toBe(0.01);
    expect(rows[0]?.save).toBe(0.99);
  });

  it("returns nothing when there is no real discount", () => {
    expect(bulkTierRows([], 2)).toEqual([]);
    expect(bulkTierRows([{ min_qty: 5, type: "percent", value: 10 }], 0)).toEqual([]);
  });
});

describe("bulkUnitFromRows (website checkout parity)", () => {
  const rows = bulkTierRows([
    { min_qty: 5, type: "flat", value: 0.05 },
    { min_qty: 10, type: "flat", value: 0.1 },
    { min_qty: 15, type: "flat", value: 0.15 },
  ], 0.35);

  it("keeps the base price below the first tier", () => {
    expect(bulkUnitFromRows(rows, 1, 0.35)).toBe(0.35);
    expect(bulkUnitFromRows(rows, 4, 0.35)).toBe(0.35);
  });

  it("applies the cheapest matching tier, like the bot and the SQL wallet function", () => {
    expect(bulkUnitFromRows(rows, 5, 0.35)).toBe(0.3);
    expect(bulkUnitFromRows(rows, 10, 0.35)).toBe(0.25);
    expect(bulkUnitFromRows(rows, 99, 0.35)).toBe(0.2);
  });

  it("ignores empty rows and never exceeds the base price", () => {
    expect(bulkUnitFromRows([], 10, 0.35)).toBe(0.35);
    expect(bulkUnitFromRows(rows, 10, 0.1)).toBe(0.1);
  });
});
