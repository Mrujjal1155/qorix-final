import { expect, test } from "bun:test";
import { catalogPriceRange, productMetaDescription } from "../../src/lib/seo";

test("price range uses live min and max USD prices", () => {
  expect(catalogPriceRange([{ price: 52 }, { price: "1.25" }, { price: 71.5 }])).toBe("$1.25 – $71.50");
});
test("price range ignores zero/missing prices and is null when empty", () => {
  expect(catalogPriceRange([{ price: 0 }, { price: null }])).toBeNull();
});
test("product meta description starts with the product name", () => {
  expect(productMetaDescription("Factory Pro 12m FW", "⚡ Duration: 12 Month ⚡ Full Warranty")).toBe(
    "Factory Pro 12m FW: Duration: 12 Month Full Warranty",
  );
});
