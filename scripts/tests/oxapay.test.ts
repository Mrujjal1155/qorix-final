import { describe, expect, test } from "bun:test";
import { createHmac } from "crypto";
import { oxapayCovers, oxapayIsOn, oxapayIsPaid } from "../../src/lib/oxapay";
import { oxapayVerifySignature } from "../../src/lib/oxapay.server";

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
});
