import { describe, expect, test } from "bun:test";
import { parseTopProductIds, selectTopProducts } from "../../src/lib/telegram-top-products";

describe("Admin-selected Telegram top products", () => {
  const products = [{ id: "a", price: 1.2, stock: 4, featured_rank: 0 }, { id: "b", price: 2, stock: 5, featured_rank: 1 }];
  test("only explicit selections appear, in selection order, not automatic featured ranking", () => {
    expect(selectTopProducts(products, ["b", "a"]).map((p) => p.id)).toEqual(["b", "a"]);
    expect(selectTopProducts(products, ["a"]).map((p) => p.id)).toEqual(["a"]);
    expect(selectTopProducts(products, [])).toEqual([]);
  });
  test("deleted, unavailable and duplicate selections do not add extra products", () => {
    expect(selectTopProducts(products, ["missing", "a", "a"]).map((p) => p.id)).toEqual(["a"]);
  });
  test("retains the user's effective single-unit price and current stock without modifying pricing", () => {
    expect(selectTopProducts(products, ["a"])[0]).toBe(products[0]);
    expect(selectTopProducts(products, ["a"])[0]?.price).toBe(1.2);
    expect(selectTopProducts(products, ["a"])[0]?.stock).toBe(4);
  });
  test("saved picks round-trip and empty save clears the selection", () => {
    expect(parseTopProductIds(JSON.stringify(["b", "a"]))).toEqual(["b", "a"]);
    expect(parseTopProductIds("[]")).toEqual([]);
    expect(parseTopProductIds("invalid")).toEqual([]);
    expect(parseTopProductIds('["a","a",7]')).toEqual(["a"]);
  });
});