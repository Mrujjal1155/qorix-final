import { describe, expect, test } from "bun:test";
import { buildLivePost, maskId, maskName, paymentLabel } from "../../src/lib/live-update";

describe("live update channel posts", () => {
  test("ID is partly hidden like 2808***968", () => {
    expect(maskId("2808123968")).toBe("2808***968");
  });
  test("customer name is hidden like A****", () => {
    expect(maskName("ahmed")).toBe("A****");
  });
  test("wallet purchases show Wallet, binance shows Binance Pay", () => {
    expect(paymentLabel("balance")).toBe("Wallet");
    expect(paymentLabel("binance_pay")).toBe("Binance Pay");
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
