import { describe, expect, it } from "bun:test";
import { buildStartMessage, communityJoinRow, inviteCopyButton, startBannerUrl } from "../../src/lib/bot/home-message";

describe("start card", () => {
  it("copy invite button has no emoji and copies the link", () => {
    expect(inviteCopyButton("https://t.me/bot?start=ref_x")).toEqual({ text: "Copy invite link", copy_text: { text: "https://t.me/bot?start=ref_x" } });
  });
  it("three join buttons, unsafe links fall back to defaults", () => {
    const row = communityJoinRow({ community_group_link: "javascript:alert(1)", community_channel_link: "https://t.me/mychan" });
    expect(row.map((b) => b.url)).toEqual(["https://t.me/QORIXCHAT", "https://t.me/mychan", "https://t.me/qorixstoreupdate"]);
  });
  it("banner only for https urls", () => {
    expect(startBannerUrl({ home_banner_url: "http://x/a.png" })).toBeNull();
    expect(startBannerUrl({ home_banner_url: "https://x/a.png" })).toBe("https://x/a.png");
  });
  it("renders a table without community text", () => {
    const html = buildStartMessage({ greeting: "Hi", rows: [["User ID", "<code>1</code>"]], choose: "Pick" });
    expect(html).toContain("<table");
    expect(html).not.toContain("Join Community");
  });
});
