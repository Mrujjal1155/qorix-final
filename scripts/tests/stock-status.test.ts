import { expect, test } from "bun:test";
import { productInStock } from "../../src/lib/stock-status";

test("auto-delivery product with 0 stock is out of stock", () => {
  expect(productInStock({ delivery_type: "auto", stock: 0 })).toBe(false);
});

test("supplier product with stock is in stock", () => {
  expect(productInStock({ delivery_type: "manual", instant: true, stock: 3 })).toBe(true);
});

test("limited manual product with 0 stock is out of stock", () => {
  expect(productInStock({ delivery_type: "manual", manual_stock_limited: true, stock: 0 })).toBe(false);
});

test("unlimited manual product stays orderable", () => {
  expect(productInStock({ delivery_type: "manual", stock: 0 })).toBe(true);
});
