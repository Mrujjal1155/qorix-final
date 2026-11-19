import { describe, expect, it } from "bun:test";
import { productEmojiIds, productPremiumMedia } from "../../src/lib/product-premium-media";

describe("captured exact product Premium media", () => {
  it("resolves every saved product emoji to actual captured media", () => {
    expect(Object.keys(productEmojiIds)).toHaveLength(377);
    for (const id of Object.keys(productEmojiIds)) {
      expect(productPremiumMedia(id)?.url).toContain(productEmojiIds[id]);
    }
  });
  it("reuses the exact existing category icon for shared emoji IDs", () => {
    expect(productPremiumMedia("0996a081-8b2d-4cf5-89bf-c803008fca41")?.url).toContain("category-6104729848675050039.webp");
  });
  it("keeps original product artwork for products without a captured premium icon", () => {
    expect(productPremiumMedia("not-a-captured-product")).toBeUndefined();
  });
});