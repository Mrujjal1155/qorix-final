import { describe, expect, it } from "bun:test";
import { categoryPremiumMedia } from "../../src/lib/category-premium-media";

describe("exact bot category media experiment", () => {
  it("uses YouTube's saved animated custom emoji, not its fallback glyph", () => {
    const media = categoryPremiumMedia("1ed309d2-79b5-4e89-919c-5e8de9e5fe9a");
    expect(media?.kind).toBe("lottie");
    expect(media?.url).toContain("category-5927210883167033019.json");
  });
  it("uses Figma's exact saved static emoji", () => {
    const media = categoryPremiumMedia("f338a7b7-a2c6-43ec-a34b-7bb412ebc0f2");
    expect(media?.kind).toBe("image");
    expect(media?.url).toContain("category-5841352506940071996.webp");
  });
  it("keeps existing artwork when no bot premium emoji is saved", () => {
    expect(categoryPremiumMedia("46b4afe0-87be-4a4b-83dd-ce2447b05c0a")).toBeUndefined();
  });
});