import { describe, expect, it } from "bun:test";
import { resolveApiPanelIcons } from "../../src/lib/api-panel-icons";

const url = (id: string, ext: string) => `https://x.supabase.co/storage/v1/object/public/public-images/website-premium/${id}.${ext}`;
const media = (id: string, kind: string, ext: string) => JSON.stringify({ emojiId: id, kind, url: url(id, ext) });
const noDownload = async () => { throw new Error("artwork must not be fetched"); };

describe("Reseller API panel artwork", () => {
  it("reuses the bot's Premium emoji media when it is already stored", async () => {
    const icons = await resolveApiPanelIcons(
      { api_icon_topup: "6204045134829458891|👛", api_icon_media_topup: media("6204045134829458891", "lottie", "json") },
      noDownload,
    );
    expect(icons.topup).toEqual({ glyph: "👛", media: { emojiId: "6204045134829458891", kind: "lottie", url: url("6204045134829458891", "json") } });
  });

  it("shows the same plain glyph as the bot when no Premium emoji is set", async () => {
    const icons = await resolveApiPanelIcons({ api_icon_docs: "📖" }, noDownload);
    expect(icons.panel).toEqual({ glyph: "🔌" });
    expect(icons.account).toEqual({ glyph: "🪪" });
    expect(icons.docs).toEqual({ glyph: "📖" });
  });

  it("prepares artwork once for a newly set emoji ID, keyed to that panel icon", async () => {
    const calls: string[] = [];
    const icons = await resolveApiPanelIcons({ api_icon_key: "6048463895901769909|🗝" }, async (id, key) => {
      calls.push(`${key}:${id}`);
      return media(id, "video", "webm");
    });
    expect(calls).toEqual(["key:6048463895901769909"]);
    expect(icons.key?.media?.url).toBe(url("6048463895901769909", "webm"));
  });

  it("keeps the glyph when artwork cannot be prepared", async () => {
    const icons = await resolveApiPanelIcons({ api_icon_revoke: "6206396878532121864|🚫" }, async () => { throw new Error("unavailable"); });
    expect(icons.revoke).toEqual({ glyph: "🚫" });
  });

  it("ignores stored artwork belonging to a different emoji ID", async () => {
    const icons = await resolveApiPanelIcons(
      { api_icon_status: "5215670591905869044|🟢", api_icon_media_status: media("1111111111111111111", "image", "webp") },
      async (id) => media(id, "image", "webp"),
    );
    expect(icons.status?.media?.emojiId).toBe("5215670591905869044");
  });
});
