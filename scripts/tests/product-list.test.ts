import { describe, expect, test } from "bun:test";
import { buildProductListMarkdown, parseEmoji } from "../../src/lib/product-list";

describe("Product list post", () => {
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
