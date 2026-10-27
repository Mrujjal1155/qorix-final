import { expect, test } from "bun:test";
import { DEFAULT_TOP_CATEGORIES, matchesTopCategory, parseTopCategories, topCategoriesSchema, topCategoryPage } from "../../src/lib/telegram-top-categories";

const lovable = { id: "lovable", name: "Our credits", keywords: ["lovable"], is_active: true };
test("defaults contain Gemini, Lovable and Muse AI in order", () => {
  expect(parseTopCategories().map((row) => row.name)).toEqual(["All Gemini Product", "All Lovable Product", "All Muse AI Product"]);
});
test("admin labels, keywords and order survive storage", () => {
  const rows = [lovable, { id: "chatgpt", name: "All ChatGPT Product", keywords: ["chatgpt"], is_active: true }];
  expect(parseTopCategories(JSON.stringify(rows))).toEqual(rows);
  expect(parseTopCategories("[]")).toEqual([]);
});
test("match brand words rather than unrelated substrings", () => {
  expect(matchesTopCategory("Lovable PRO 100 Credit NW", lovable)).toBe(true);
  expect(matchesTopCategory("Unlovable tool", lovable)).toBe(false);
  expect(matchesTopCategory("Google AI Pro 12m", DEFAULT_TOP_CATEGORIES[0] ?? lovable)).toBe(true);
});
test("top category excludes sold out and unrelated rows but keeps distinct same-name products", () => {
  const rows = [
    { id: "a", name: "Lovable 100 Credits", stock: 3 },
    { id: "b", name: "Lovable 100 Credits", stock: 1 },
    { id: "c", name: "Lovable 300 Credits", stock: 0 },
    { id: "d", name: "Gemini", stock: 5 },
  ];
  expect(topCategoryPage(rows, lovable, 0).products.map((row) => row.id)).toEqual(["a", "b"]);
});
test("30-product paging reaches all matching products and clamps stale pages", () => {
  const rows = Array.from({ length: 65 }, (_, index) => ({ id: String(index), name: `Lovable ${index + 1} Credits`, stock: 1 }));
  expect(topCategoryPage(rows, lovable, 0).products).toHaveLength(30);
  expect(topCategoryPage(rows, lovable, 1).products).toHaveLength(30);
  const last = topCategoryPage(rows, lovable, 99);
  expect(last.products.map((row) => row.id)).toEqual(["60", "61", "62", "63", "64"]);
  expect(last.page).toBe(2);
  expect(last.hasNext).toBe(false);
});
test("disabled categories cannot return products from old buttons", () => {
  expect(topCategoryPage([{ name: "Lovable", stock: 3 }], { ...lovable, is_active: false }, 0).total).toBe(0);
});
test("duplicate callback IDs and empty keyword rules are rejected", () => {
  expect(topCategoriesSchema.safeParse([lovable, lovable]).success).toBe(false);
  expect(topCategoriesSchema.safeParse([{ ...lovable, keywords: [] }]).success).toBe(false);
});