import { expect, test } from "bun:test";
import { liveProductPremiumMedia } from "../../src/lib/live-product-premium";

const id = "new-product-not-in-captured-map";
const emojiId = "5400280896311944960";
const latest = { emojiId, kind: "video" as const, url: `https://example.supabase.co/storage/v1/object/public/public-images/website-premium/${emojiId}.webm` };
const captured = { kind: "image" as const, url: "https://old.example/icon.webp" };
test("new product resolves current media without a captured product-ID entry", () => {
  expect(liveProductPremiumMedia(id, { [`site_product_icon_${id}`]: JSON.stringify(latest) }, undefined)).toEqual(latest);
});
test("changing an emoji replaces old captured artwork", () => {
  expect(liveProductPremiumMedia(id, { [`site_product_icon_${id}`]: JSON.stringify(latest) }, captured)?.url).toBe(latest.url);
});
test("removed and pending emoji never resurrect old captures", () => {
  expect(liveProductPremiumMedia(id, { [`site_product_icon_${id}`]: "" }, captured)).toBeUndefined();
  expect(liveProductPremiumMedia(id, { [`site_product_icon_${id}`]: JSON.stringify({ emojiId }) }, captured)).toBeUndefined();
});
test("legacy captures remain until their live assignment is reconciled", () => {
  expect(liveProductPremiumMedia(id, {}, captured)).toEqual(captured);
});
test("unsafe stored media cannot become customer artwork", () => {
  expect(liveProductPremiumMedia(id, { [`site_product_icon_${id}`]: JSON.stringify({ ...latest, url: "https://api.telegram.org/file/botsecret/icon.webm" }) }, captured)).toBeUndefined();
});