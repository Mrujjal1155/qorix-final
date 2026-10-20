import { describe, expect, test } from "bun:test";
import { IN_HOUSE_FILTER, countBySupplier, filterCatalogue, parseTopProductIds, selectTopProducts } from "../../src/lib/telegram-top-products";

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

describe("Top Products admin supplier filter", () => {
  const list = [
    { name: "Muse AI Account", supplier_name: "Vexorix" },
    { name: "YouTube 3M Link", supplier_name: "Routeis" },
    { name: "Lovable Lite", supplier_name: null },
    { name: "Gamma Pro", supplier_name: "Vexorix " },
  ];
  test("clicking In-house keeps only products without a supplier", () => {
    expect(filterCatalogue(list, { supplier: IN_HOUSE_FILTER }).map((p) => p.name)).toEqual(["Lovable Lite"]);
  });
  test("clicking a supplier keeps only that supplier's products", () => {
    expect(filterCatalogue(list, { supplier: "Vexorix" }).map((p) => p.name)).toEqual(["Muse AI Account", "Gamma Pro"]);
  });
  test("no selection shows everything and the filter combines with the search box", () => {
    expect(filterCatalogue(list, {}).length).toBe(4);
    expect(filterCatalogue(list, { supplier: "Vexorix", search: "gamma" }).map((p) => p.name)).toEqual(["Gamma Pro"]);
    expect(filterCatalogue(list, { supplier: "Routeis", search: "lovable" })).toEqual([]);
  });
  test("chip counts cover every supplier and in-house once", () => {
    const counts = countBySupplier(list);
    expect(counts.get("Vexorix")).toBe(2);
    expect(counts.get("Routeis")).toBe(1);
    expect(counts.get(IN_HOUSE_FILTER)).toBe(1);
  });
});