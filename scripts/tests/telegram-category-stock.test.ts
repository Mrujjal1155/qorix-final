import { describe, expect, test } from "bun:test";
import { availableCatalogue, categoryCatalogue, stockRowStyle, telegramCategories } from "../../src/lib/bot/catalogue";

describe("Telegram category stock visibility", () => {
  const products = [
    { id: "ready", category_id: "canva", stock: 3, delivery_type: "auto", price: 2 },
    { id: "sold-out", category_id: "canva", stock: 0, delivery_type: "auto", price: 1 },
    { id: "preorder", category_id: "canva", stock: 0, delivery_type: "auto", preorder_enabled: true },
    { id: "linked", category_id: "other", stock: 0, delivery_type: "auto" },
    { id: "unlimited", category_id: "canva", stock: 0, delivery_type: "manual" },
    { id: "limited", category_id: "canva", stock: 0, delivery_type: "manual", manual_stock_limited: true },
  ];
  test("all 24 active categories remain visible without products, above 16", () => {
    const categories = Array.from({ length: 24 }, (_, i) => ({ id: String(i), is_active: true, channel: "both" }));
    expect(telegramCategories(categories).map((c) => c.id)).toEqual(categories.map((c) => c.id));
    expect(telegramCategories(categories)).toHaveLength(24);
  });
  test("disabled and website-only categories stay hidden", () => {
    expect(telegramCategories([
      { id: "off", is_active: false, channel: "both" },
      { id: "web", is_active: true, channel: "website" },
      { id: "bot", is_active: true, channel: "telegram" },
    ]).map((c) => c.id)).toEqual(["bot"]);
  });
  test("category click retains sold-out and linked products without duplicating rows", () => {
    const list = categoryCatalogue(products, "canva", { canva: new Set(["linked", "ready"]) });
    expect(list.map((p) => p.id)).toEqual(["ready", "sold-out", "preorder", "linked", "unlimited", "limited"]);
    expect(list[0]).toBe(products[0]);
    expect(list[1]?.price).toBe(1);
    expect(categoryCatalogue(products, "empty", {})).toEqual([]);
  });
  test("favorites and All Products exclude sold-out rows including preorders", () => {
    expect(availableCatalogue(products).map((p) => p.id)).toEqual(["ready", "unlimited"]);
    expect(availableCatalogue([products[1], products[2], products[5]].filter((p) => p !== undefined))).toEqual([]);
  });
  test("sold-out automatic and limited manual rows are red; unlimited manual retains the chosen colour", () => {
    expect(products.map((p) => stockRowStyle(p, "primary"))).toEqual(["primary", "danger", "danger", "danger", "primary", "danger"]);
    expect(stockRowStyle({ stock: 2, delivery_type: "auto" }, "success")).toBe("success");
  });
});