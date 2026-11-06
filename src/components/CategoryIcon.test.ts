import { describe, expect, it } from "vitest";
import { distinctCategoryIcons } from "./CategoryIcon";

describe("distinctCategoryIcons", () => {
  it("never gives two categories the same icon", () => {
    const names = ["AI Tools", "AI Chat", "Streaming", "VPN", "Misc", "Other", "Gift Cards", "Extras"];
    const icons = [...distinctCategoryIcons(names).values()];
    expect(new Set(icons).size).toBe(names.length);
  });
});
