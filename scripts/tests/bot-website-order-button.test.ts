import { expect, test } from "bun:test";
import { homeMenuColor } from "../../src/lib/bot/home-menu-colors";
import { websiteOrderRow } from "../../src/lib/bot/website-order-button";

const SITE = "https://qorixlab.com";

test("website order row is one full-width blue button that opens the site", () => {
  const row = websiteOrderRow({ text: "🌐 Order from Website", url: SITE });
  expect(row).toHaveLength(1);
  expect(row[0]).toEqual({ text: "🌐 Order from Website", url: SITE, style: "primary" });
});

test("the row is blue even when the incoming button was green", () => {
  const row = websiteOrderRow({ text: "🌐 Order from Website", url: SITE, style: "success" });
  expect(row[0].style).toBe("primary");
});

test("a premium icon on the button is kept", () => {
  const row = websiteOrderRow({ text: "Order from Website", url: SITE, icon_custom_emoji_id: "5278702045883292456" });
  expect(row[0].icon_custom_emoji_id).toBe("5278702045883292456");
});

test("no usable website link means no button, so the keyboard stays valid", () => {
  expect(websiteOrderRow({ text: "Order from Website", url: "" })).toEqual([]);
  expect(websiteOrderRow({ text: "Order from Website", url: "t.me/qorix" })).toEqual([]);
  expect(websiteOrderRow(null)).toEqual([]);
});

test("the home menu keeps the website order button blue whatever the admin main-menu colour is", () => {
  expect(homeMenuColor("website", "success")).toBe("primary");
  expect(homeMenuColor("website", "danger")).toBe("primary");
  expect(homeMenuColor("website", "default")).toBe("primary");
});
