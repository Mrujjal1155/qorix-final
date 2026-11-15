import { describe, expect, it } from "vitest";
import { canAdminDecide, lateApprovalGateway, lateApprovalReference } from "./admin-late-approval";

describe("admin late approval", () => {
  it("covers only Binance Pay, Bybit, BEP20, TRC20", () => {
    expect(lateApprovalGateway("Binance Pay")).toBe("payid");
    expect(lateApprovalGateway("bybit")).toBe("bybit");
    expect(lateApprovalGateway("USDT BSC")).toBe("chain_bep20");
    expect(lateApprovalGateway("USDT TRX")).toBe("chain_trc20");
    expect(lateApprovalGateway("eps_card")).toBeNull();
    expect(lateApprovalGateway("oxapay")).toBeNull();
  });
  it("same TXID always gives same credit reference (no double credit)", () => {
    expect(lateApprovalReference("payid", "ABC", "r1")).toBe(lateApprovalReference("payid", "abc", "r2"));
  });
  it("expired requests can still be approved", () => {
    expect(canAdminDecide("expired")).toBe(true);
    expect(canAdminDecide("approved")).toBe(false);
  });
});
