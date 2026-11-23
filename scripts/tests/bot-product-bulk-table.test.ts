import { expect, test } from "bun:test";
import { productBulkRows } from "../../src/lib/bot/product-bulk-table";

const tiers = [
  { min_qty: 5, type: "flat" as const, value: 0.05 },
  { min_qty: 10, type: "flat" as const, value: 0.1 },
  { min_qty: 15, type: "flat" as const, value: 0.15 },
];

test("product detail exposes configured 5+, 10+, 15+ per-piece prices", () => {
  expect(productBulkRows({ price: 0.35 }, tiers)).toEqual([
    { min_qty: 5, unit: 0.3 }, { min_qty: 10, unit: 0.25 }, { min_qty: 15, unit: 0.2 },
  ]);
});

test("products without bulk rules have no rows", () => {
  expect(productBulkRows({ price: 0.35 }, [])).toEqual([]);
});

test("active flash sale suppresses bulk prices exactly as checkout does", () => {
  expect(productBulkRows({ price: 0.35, flash_ends_at: new Date(Date.now() + 60000).toISOString() }, tiers)).toEqual([]);
});

test("overlapping thresholds use the cheapest applicable price, not the first duplicate", () => {
  expect(productBulkRows({ price: 0.35 }, [...tiers, { min_qty: 5, type: "flat", value: 0.12 }])).toEqual([
    { min_qty: 5, unit: 0.23 }, { min_qty: 10, unit: 0.23 }, { min_qty: 15, unit: 0.2 },
  ]);
});

test("special prices are never bulk-discounted a second time", () => {
  expect(productBulkRows({ price: 0.28, _public_price: 0.35 }, tiers)).toEqual([
    { min_qty: 10, unit: 0.25 }, { min_qty: 15, unit: 0.2 },
  ]);
});

test("per-piece price retains the existing one-cent minimum", () => {
  expect(productBulkRows({ price: 0.35 }, [{ min_qty: 5, type: "flat", value: 1 }])).toEqual([{ min_qty: 5, unit: 0.01 }]);
});
import { keepRichLineBreaks as krlb } from "../../src/lib/bot/product-bulk-table";
import { test as t2, expect as e2 } from "bun:test";
t2("description newlines survive next to a table", () => {
  e2(krlb("a\n<table><tr><td>x\ny</td></tr></table>\nb\nc")).toBe("a<br/><table><tr><td>x\ny</td></tr></table><br/>b<br/>c");
});
