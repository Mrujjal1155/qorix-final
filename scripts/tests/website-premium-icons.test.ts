import { expect, test } from "bun:test";
import { WEBSITE_PREMIUM_ICONS, websiteIconInput, websiteIconMedia } from "../../src/lib/website-premium-icons";

const id = "5400280896311944960";
const publicUrl = `https://zohumyfxfhyzwjzxjdzi.supabase.co/storage/v1/object/public/public-images/website-premium/${id}.webp`;

test("website editor accepts only its five named placements, never bot menu or payment settings", () => {
  expect(WEBSITE_PREMIUM_ICONS).toHaveLength(5);
  for (const icon of WEBSITE_PREMIUM_ICONS) expect(websiteIconInput.parse({ values: { [icon.key]: id } }).values[icon.key]).toBe(id);
  for (const key of ["menu_icon_back", "stars_enabled", "ui_icon_wal_stars", "site_brand_name"]) expect(websiteIconInput.safeParse({ values: { [key]: id } }).success).toBe(false);
});
test("empty ID resets artwork; invalid identifiers cannot be saved", () => {
  expect(websiteIconInput.parse({ values: { site_web_icon_connect_button: "" } }).values["site_web_icon_connect_button"]).toBe("");
  for (const value of ["123", "https://api.telegram.org/file/botsecret/a.webp", "<tg-emoji>test</tg-emoji>"]) expect(websiteIconInput.safeParse({ values: { site_web_icon_connect_button: value } }).success).toBe(false);
});
test("website renders only public stored artwork, never Telegram or credential-bearing URLs", () => {
  expect(websiteIconMedia(JSON.stringify({ emojiId: id, kind: "image", url: publicUrl }))?.url).toBe(publicUrl);
  for (const url of ["https://api.telegram.org/file/botsecret/a.webp", "javascript:alert(1)", publicUrl + "?token=secret", publicUrl.replace("https://", "https://user:secret@"), publicUrl.replace(".supabase.co", ".example.com")]) expect(websiteIconMedia(JSON.stringify({ emojiId: id, kind: "image", url }))).toBeUndefined();
});
test("video and Lottie files keep matching format; unset or malformed media uses fallback", () => {
  for (const [kind, ext] of [["video", "webm"], ["lottie", "json"]]) expect(websiteIconMedia(JSON.stringify({ emojiId: id, kind, url: publicUrl.replace("webp", ext ?? "") }))?.kind).toBe(kind);
  expect(websiteIconMedia("")).toBeUndefined();
  expect(websiteIconMedia(JSON.stringify({ emojiId: id, kind: "lottie", url: publicUrl }))).toBeUndefined();
});