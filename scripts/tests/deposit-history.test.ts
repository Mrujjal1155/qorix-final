import { describe, expect, test } from "bun:test";
import {
  depositGatewayLabel,
  depositStatus,
  formatDepositTable,
  manualMethodLabel,
  mergeDepositRows,
} from "../../src/lib/bot/deposit-history";

describe("deposit gateway labels", () => {
  test("each auto-gateway kind maps to a human label", () => {
    expect(depositGatewayLabel("payid")).toBe("Binance Pay");
    expect(depositGatewayLabel("crypto")).toBe("Binance USDT");
    expect(depositGatewayLabel("bybit")).toBe("Bybit Pay");
    expect(depositGatewayLabel("chain_trc20")).toBe("USDT TRC20");
    expect(depositGatewayLabel("chain_bep20")).toBe("USDT BEP20");
    expect(depositGatewayLabel("oxapay")).toBe("OxaPay");
    expect(depositGatewayLabel("eps")).toBe("EPS");
  });
  test("manual methods keep their brand spelling", () => {
    expect(manualMethodLabel("bkash")).toBe("bKash");
    expect(manualMethodLabel("nagad")).toBe("Nagad");
  });
});

describe("deposit status mapping", () => {
  test("auto rows: credited is complete, pending stays pending, expired/failed map through", () => {
    expect(depositStatus("credited", "auto")).toBe("complete");
    expect(depositStatus("pending", "auto")).toBe("pending");
    expect(depositStatus("expired", "auto")).toBe("expired");
    expect(depositStatus("failed", "auto")).toBe("failed");
  });
  test("manual rows: approved is complete, rejected is failed", () => {
    expect(depositStatus("approved", "manual")).toBe("complete");
    expect(depositStatus("rejected", "manual")).toBe("failed");
    expect(depositStatus("pending", "manual")).toBe("pending");
  });
});

describe("mergeDepositRows", () => {
  test("merges both sources sorted newest-first regardless of input order", () => {
    const rows = mergeDepositRows(
      [
        { kind: "bybit", amount_usdt: 5, status: "credited", created_at: "2026-11-01T10:00:00Z" },
        { kind: "chain_trc20", amount_usdt: 3, status: "pending", created_at: "2026-11-02T08:00:00Z" },
      ],
      [{ method: "bkash", amount: 10, status: "approved", created_at: "2026-11-01T18:00:00Z" }],
    );
    expect(rows.map((r) => r.gateway)).toEqual(["USDT TRC20", "bKash", "Bybit Pay"]);
    expect(rows[0].status).toBe("pending");
    expect(rows[1].status).toBe("complete");
  });
});

describe("formatDepositTable", () => {
  test("renders a fixed-width table with header, divider and one line per row", () => {
    const out = formatDepositTable(
      [
        { gateway: "Binance Pay", amount: 10, status: "complete", created_at: "2026-11-02T06:00:00Z" },
        { gateway: "USDT BEP20", amount: 2.5, status: "failed", created_at: "2026-11-01T06:00:00Z" },
      ],
      "Asia/Dhaka",
    );
    const lines = out.split("\n");
    expect(lines[0]).toContain("Gateway");
    expect(lines[0]).toContain("Amount");
    expect(lines[0]).toContain("Status");
    expect(lines[2]).toContain("Binance Pay");
    expect(lines[2]).toContain("$10.00");
    expect(lines[2]).toContain("Complete");
    expect(lines[3]).toContain("Failed");
    expect(lines[2]).toContain("02 Nov");
  });
  test("escapes HTML so the table is safe inside <pre>", () => {
    const out = formatDepositTable(
      [{ gateway: "<b>evil</b>", amount: 1, status: "pending", created_at: "2026-11-01T00:00:00Z" }],
      "Asia/Dhaka",
    );
    expect(out).not.toContain("<b>");
    expect(out).toContain("&lt;b&gt;");
  });
});
