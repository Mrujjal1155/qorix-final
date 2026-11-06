import { expect, test } from "bun:test";
import { categoriesWithProducts } from "../../src/lib/category-count";

test("counts a category only when it holds a listed product, including secondary categories", () => {
  const cats = [{ id: "a" }, { id: "b" }, { id: "empty" }];
  const prods = [{ category_id: "a", category_ids: ["a", "b"] }, { category_id: "a" }];
  const out = categoriesWithProducts(cats, prods);
  expect(out.map((c) => c.id)).toEqual(["a", "b"]);
  expect(out.find((c) => c.id === "a")?.n).toBe(2);
});
