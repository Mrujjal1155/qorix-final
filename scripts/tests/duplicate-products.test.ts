import { expect, test } from "bun:test";
import { duplicateNotes } from "../../src/lib/duplicate-products";

test("same-name products get distinct notes; unique names get none", () => {
  const notes = duplicateNotes([
    { id: "a", name: "Gamma Pro 12m FW", price: 52, delivery_time: "Full warranty", in_stock: false },
    { id: "b", name: " Gamma Pro 12m FW", price: 40, in_stock: true },
    { id: "c", name: "Solo", price: 1 },
  ]);
  expect(notes.get("b")).toBe("Option 1 of 2 · $40.00 · Warranty: see details · In stock");
  expect(notes.get("a")).toBe("Option 2 of 2 · $52.00 · Full warranty · Out of stock");
  expect(notes.has("c")).toBe(false);
});
