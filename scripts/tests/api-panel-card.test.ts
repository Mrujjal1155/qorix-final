import { describe, expect, it } from "bun:test";
import { apiBannerUrl, buildApiPanelCard } from "../../src/lib/bot/api-panel-card";

describe("bot Reseller API card", () => {
  it("uses only an https admin banner", () => {
    expect(apiBannerUrl({ api_banner_url: "https://x.test/b.png" })).toBe("https://x.test/b.png");
    expect(apiBannerUrl({ api_banner_url: "http://x.test/b.png" })).toBeNull();
    expect(apiBannerUrl({})).toBeNull();
  });
  it("puts the banner above a table and omits it when unset", () => {
    const card = buildApiPanelCard({ banner: "https://x.test/b.png", title: "T", rows: [[["A", "1"], ["B", "2"]], [["C", "3"]]], note: "n" });
    expect(card.indexOf("<img")).toBeLessThan(card.indexOf("<table"));
    expect(card).toContain('<td colspan="3">3</td>');
    expect(buildApiPanelCard({ banner: null, title: "T", rows: [], note: "n" })).not.toContain("<img");
  });
});
