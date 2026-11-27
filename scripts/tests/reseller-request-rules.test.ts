import { expect, test } from "bun:test";
import { isOrderRequestObject, resellerOrderLimit } from "../../src/lib/reseller/request-rules";
test("order history limit retains 50 default and 100 maximum", () => {
  expect(resellerOrderLimit(null)).toBe(50);
  expect(resellerOrderLimit("500")).toBe(100);
  expect(resellerOrderLimit("0")).toBe(1);
  expect(resellerOrderLimit("2.9")).toBe(2);
  expect(resellerOrderLimit("invalid")).toBe(50);
  expect(resellerOrderLimit("Infinity")).toBe(50);
});
test("only object JSON reaches purchase", () => {
  for (const value of [null, [], 1, "x", true]) expect(isOrderRequestObject(value)).toBe(false);
  expect(isOrderRequestObject({ product_id: "fixture" })).toBe(true);
});import { parseOrderQuantity } from "../../src/lib/reseller/request-rules";
test("order quantity is 1–50 whole numbers, never silently clamped", () => {
  expect(parseOrderQuantity(undefined)).toBe(1);
  expect(parseOrderQuantity(2)).toBe(2);
  expect(parseOrderQuantity("50")).toBe(50);
  for (const v of [0, 51, 999, 2.5, -1, "abc", true]) expect(parseOrderQuantity(v)).toBe(null);
});
