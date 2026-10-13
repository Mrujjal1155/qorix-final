import { describe, expect, test } from "bun:test";
import { createHmac } from "crypto";
import { oxapayCovers, oxapayDepositMeta, oxapayIsOn, oxapayIsPaid } from "../../src/lib/oxapay";
import { oxapayEnabled, oxapayVerifySignature } from "../../src/lib/oxapay.server";
import { uiBtn, uiIconHtml } from "../../src/lib/bot/ui.server";

describe("OxaPay rules", () => {
  test("only paid / manual_accept count as paid", () => {
    expect(oxapayIsPaid("Paid")).toBe(true);
    expect(oxapayIsPaid("manual_accept")).toBe(true);
    expect(oxapayIsPaid("paying")).toBe(false);
    expect(oxapayIsPaid("underpaid")).toBe(false);
    expect(oxapayIsPaid("expired")).toBe(false);
  });

  test("amount must cover the order total", () => {
    expect(oxapayCovers(10, 10)).toBe(true);
    expect(oxapayCovers(9.99, 10)).toBe(false);
  });

  test("gateway stays off unless switched on", () => {
    expect(oxapayIsOn({})).toBe(false);
    expect(oxapayIsOn({ oxapay_enabled: "off" })).toBe(false);
    expect(oxapayIsOn({ oxapay_enabled: "on" })).toBe(true);
  });

  test("webhook signature must match the merchant key", () => {
    const body = '{"track_id":"1","status":"Paid"}';
    const sig = createHmac("sha512", "k1").update(body).digest("hex");
    expect(oxapayVerifySignature("k1", body, sig)).toBe(true);
    expect(oxapayVerifySignature("k2", body, sig)).toBe(false);
    expect(oxapayVerifySignature("k1", body + " ", sig)).toBe(false);
  });

  test("configured gateway follows the saved admin switch", () => {
    expect(oxapayEnabled({ oxapay_enabled: "on", oxapay_api_key: "test-merchant-key" })).toBe(true);
    expect(oxapayEnabled({ oxapay_enabled: "off", oxapay_api_key: "test-merchant-key" })).toBe(false);
  });

  test("direct payment preserves items and manual inputs for settlement", () => {
    const checkout = { items: [{ product_id: "p1", qty: 2 }], inputs: { p1: ["customer input"] }, total: 0.08, coupon: null };
    const saved = oxapayDepositMeta(oxapayDepositMeta(checkout), "track-1", "https://pay.oxapay.com/test");
    expect(saved.items).toEqual([{ product_id: "p1", qty: 2 }]);
    expect(saved.inputs).toEqual({ p1: ["customer input"] });
    expect(saved.total).toBe(0.08);
    expect(saved.track_id).toBe("track-1");
  });

  test("one admin Premium icon applies to wallet and product checkout", () => {
    const settings = { ui_icon_wal_oxapay: "5400280896311944960|🪙" };
    expect(uiBtn(settings, "wal_oxapay", "dep:oxapay").icon_custom_emoji_id).toBe("5400280896311944960");
    expect(uiBtn(settings, "wal_oxapay", "copm:oxapay").icon_custom_emoji_id).toBe("5400280896311944960");
    expect(uiIconHtml(settings, "wal_oxapay")).toContain('emoji-id="5400280896311944960"');
  });
});
