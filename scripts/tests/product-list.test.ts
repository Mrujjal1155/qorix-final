import { describe, expect, test } from "bun:test";
import { buildProductListMarkdown, parseEmoji, productListBatch } from "../../src/lib/product-list";

describe("Product list post", () => {
  test("first generation includes exactly the first 40 products", () => {
    const products = Array.from({ length: 70 }, (_, i) => i + 1);
    const first = productListBatch(products);
    expect(first.products).toEqual(products.slice(0, 40));
    expect(first.nextOffset).toBe(40);
  });
  test("second generation includes remaining 30 without repeating the first 40", () => {
    const products = Array.from({ length: 70 }, (_, i) => i + 1);
    const second = productListBatch(products, productListBatch(products).nextOffset);
    expect(second.products).toEqual(products.slice(40));
    expect(second.products.length).toBe(30);
    expect(second.nextOffset).toBe(0);
  });
  test("larger catalogues continue in batches without loss", () => {
    const products = Array.from({ length: 95 }, (_, i) => i + 1);
    const first = productListBatch(products);
    const second = productListBatch(products, first.nextOffset);
    const third = productListBatch(products, second.nextOffset);
    expect([first.products.length, second.products.length, third.products.length]).toEqual([40, 40, 15]);
    expect([...first.products, ...second.products, ...third.products]).toEqual(products);
  });
  test("uses product premium emoji, escapes table pipes and formats price", () => {
    const md = buildProductListMarkdown({
      storeName: "QORIX", botUsername: "@QORIX3_bot",
      products: [{ name: "Lovable | Pro", price: 4, emoji: "❤️", custom_emoji_id: "5204116184986844054" }],
      emojis: {},
    });
    expect(md).toContain("![❤️](tg://emoji?id=5204116184986844054) Lovable \\| Pro");
    expect(md).toContain("\\$4\\.00");
    expect(md).toContain("@QORIX3_bot");
  });
  test("admin emoji setting overrides the default glyph", () => {
    expect(parseEmoji("5368324170671202286|🔥", "✅")).toEqual({ customId: "5368324170671202286", glyph: "🔥" });
    expect(parseEmoji("", "✅")).toEqual({ customId: "", glyph: "✅" });
  });
});
