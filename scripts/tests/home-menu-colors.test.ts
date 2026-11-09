import { expect, test } from "bun:test";
import {
  HOME_MENU_GREEN_KEYS,
  HOME_MENU_NORMAL_KEYS,
  HOME_MENU_TOP_KEYS,
  homeMenuColor,
} from "../../src/lib/bot/home-menu-colors";

test("top menu rows (shop, cart, orders, wallet, freebies, profile) are blue", () => {
  for (const key of HOME_MENU_TOP_KEYS) {
    expect(homeMenuColor(key, "primary")).toBe("primary");
  }
});

test("the single referral store button keeps telegram's normal colour", () => {
  for (const key of HOME_MENU_NORMAL_KEYS) {
    expect(homeMenuColor(key, "primary")).toBe("default");
    expect(homeMenuColor(key, "success")).toBe("default");
  }
});

test("support, emails, reseller api and clear chat are green", () => {
  for (const key of HOME_MENU_GREEN_KEYS) {
    expect(homeMenuColor(key, "primary")).toBe("success");
  }
});

test("every home menu key is classified exactly once", () => {
  const all = [...HOME_MENU_TOP_KEYS, ...HOME_MENU_GREEN_KEYS, ...HOME_MENU_NORMAL_KEYS];
  expect(new Set(all).size).toBe(all.length);
  expect([...all].sort()).toEqual(
    ["shop", "cart", "orders", "wallet", "freebies", "profile", "referral", "support", "emails", "api", "clear"].sort(),
  );
});
