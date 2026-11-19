import { describe, expect, it } from "bun:test";
import { premiumAssetUrl } from "../../src/lib/premium-asset-url";

describe("premium media on the external shop", () => {
  it("resolves Lovable media outside the external shop's missing asset route", () => {
    const path = "/__l5e/assets-v1/icon/category.webp";
    expect(premiumAssetUrl(path)).toBe("https://friendly-flutter-works.lovable.app" + path);
    expect(new URL(premiumAssetUrl(path), "https://qorixlab.com").hostname).toBe("friendly-flutter-works.lovable.app");
  });
  it("preserves existing absolute artwork and unrelated local paths", () => {
    expect(premiumAssetUrl("https://example.com/icon.webp")).toBe("https://example.com/icon.webp");
    expect(premiumAssetUrl("/assets/oxapay.png")).toBe("/assets/oxapay.png");
  });
});