import { expect, test } from "bun:test";
import { distinctCategoryIcons } from "../../src/components/CategoryIcon";

test("never gives two categories the same icon", () => {
  const names = ["AI Tools", "AI Chat", "Streaming", "VPN", "Misc", "Other", "Gift Cards", "Extras"];
  const icons = [...distinctCategoryIcons(names).values()];
  expect(new Set(icons).size).toBe(names.length);
});
