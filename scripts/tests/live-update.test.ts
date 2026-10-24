import { describe, expect, test } from "bun:test";
import { buildLivePost, livePostKeyboard, maskId, maskName, paymentLabel } from "../../src/lib/live-update";

describe("live update channel posts", () => {
  test("purchase posts get a Buy Now button that opens the bot", () => {
    const kb = livePostKeyboard("purchase", "QORIX3_bot");
    expect(kb).toEqual([[{ text: "🛒 Buy Now", url: "https://t.me/QORIX3_bot" }]]);
    expect(livePostKeyboard("purchase", "@QORIX3_bot")).toEqual(kb);
  });
  test("top-up, member posts and missing username stay plain", () => {
    expect(livePostKeyboard("topup", "QORIX3_bot")).toBeUndefined();
    expect(livePostKeyboard("member", "QORIX3_bot")).toBeUndefined();
    expect(livePostKeyboard("purchase", "")).toBeUndefined();
    expect(livePostKeyboard("purchase", undefined)).toBeUndefined();
  });
  test("ID is partly hidden like 2808***968", () => {
    expect(maskId("2808123968")).toBe("2808***968");
  });
  test("customer name is hidden like A****", () => {
    expect(maskName("ahmed")).toBe("A****");
  });
  test("wallet purchases show Wallet, binance shows Binance Pay, reseller shows Reseller Balance", () => {
    expect(paymentLabel("balance")).toBe("Wallet");
    expect(paymentLabel("binance_pay")).toBe("Binance Pay");
    expect(paymentLabel("reseller_balance")).toBe("Reseller Balance");
  });
  test("reseller API sale renders like any other purchase, identity masked", () => {
    const t = buildLivePost("purchase", { uid: "7f3c9d21-55ab-4c88-90e1-2b6f4a77c3d4", name: "Rahim", product: "Netflix 1M", qty: 2, method: "reseller_balance" }, new Date("2026-10-24T17:32:00Z"));
    expect(t).not.toContain("7f3c9d21");
    expect(t).not.toContain("Rahim");
    expect(t).toContain("Product: <b>Netflix 1M</b>");
    expect(t).toContain("Paid: Reseller Balance");
    expect(t).toContain("Successfully delivered");
  });
  test("purchase post never contains the full id or name", () => {
    const t = buildLivePost("purchase", { uid: "2808123968", name: "Ahmed", product: "Gemini", qty: 3, method: "balance" }, new Date("2026-10-24T17:32:00Z"));
    expect(t).not.toContain("2808123968");
    expect(t).not.toContain("Ahmed");
    expect(t).toContain("Quantity: <b>3</b>");
    expect(t).toContain("24-Oct-2026 05:32 PM UTC");
  });
  test("premium emoji id becomes a tg-emoji tag", () => {
    const t = buildLivePost("topup", { uid: "1", method: "oxapay" }, new Date(), { title: "5204116184986844054" });
    expect(t).toContain('<tg-emoji emoji-id="5204116184986844054">🎉</tg-emoji>');
  });
});
