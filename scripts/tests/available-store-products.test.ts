import { expect, test } from "bun:test";
import { availableStoreProducts } from "../../src/lib/available-store-products";

test("sold-out products are hidden and return when stock availability changes", () => {
  const products = [
    { id: "available", in_stock: true },
    { id: "sold-out", in_stock: false },
  ];
  expect(availableStoreProducts(products).map((p) => p.id)).toEqual(["available"]);
  products[1].in_stock = true;
  expect(availableStoreProducts(products).map((p) => p.id)).toEqual(["available", "sold-out"]);
});

test("raw zero stock does not hide an explicitly available unlimited product", () => {
  const product = { id: "unlimited", in_stock: true, stock: 0 };
  expect(availableStoreProducts([product])).toEqual([product]);
});