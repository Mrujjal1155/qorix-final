import { describe, expect, it } from "bun:test";
import { productMessagePremiumMedia } from "../../src/lib/product-message-premium-media";

describe("captured product message media", () => {
  it("resolves the separately captured Add to Cart icon", () => {
    const media = productMessagePremiumMedia("ui_icon_prod_addcart");
    expect(media?.kind).toBe("lottie");
    expect(media?.url).toContain("6206375377925839184.json");
  });
  it("keeps the automatic and manual delivery media distinct", () => {
    const auto = productMessagePremiumMedia("ui_icon_prod_auto_note");
    const manual = productMessagePremiumMedia("ui_icon_prod_manual_note");
    expect(auto?.url).toContain("5224607267797606837.json");
    expect(manual?.url).toContain("5787192063099408213.webm");
    expect(auto?.url).not.toBe(manual?.url);
  });
});