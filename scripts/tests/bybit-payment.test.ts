import { describe, expect, test } from "bun:test";
import { bybitEnabled, bybitTransactionKey, matchBybitDeposit, type BybitDeposit } from "../../src/lib/bybit-payment";

const row: BybitDeposit = { txID: "transfer-123", coin: "USDT", amount: "10.25000000", status: 2, type: 1, createdTime: "1793445000" };
const claim = { txid: "transfer-123", amount: 10.25, since: 1793444999000, until: 1793445001000 };
describe("Bybit internal transfer rules", () => {
  test("accepts successful exact USDT payment", () => expect(matchBybitDeposit(row, claim)).toBe(true));
  test("rejects processing and failed transfers", () => { for (const status of [1, 3]) expect(matchBybitDeposit({ ...row, status }, claim)).toBe(false); });
  test("rejects wrong transaction ID", () => expect(matchBybitDeposit(row, { ...claim, txid: "other-123" })).toBe(false));
  test("rejects non-USDT", () => expect(matchBybitDeposit({ ...row, coin: "USDC" }, claim)).toBe(false));
  test("rejects both lower and higher amounts without tolerance", () => { for (const amount of ["10.24", "10.26", "10.250000001"]) expect(matchBybitDeposit({ ...row, amount }, claim)).toBe(false); });
  test("rejects old transfers", () => expect(matchBybitDeposit({ ...row, createdTime: "1793444000" }, claim)).toBe(false));
  test("rejects future transfers", () => expect(matchBybitDeposit({ ...row, createdTime: "1793446000" }, claim)).toBe(false));
  test("rejects non-internal deposits", () => expect(matchBybitDeposit({ ...row, type: 2 }, claim)).toBe(false));
  test("fails closed until connected, verified and enabled", () => { expect(bybitEnabled({ bybit_uid: "12345" })).toBe(false); expect(bybitEnabled({ bybit_enabled: "1", bybit_uid: "12345", bybit_api_verified: "1" })).toBe(true); });
  test("namespaces Bybit transaction IDs separately", () => expect(bybitTransactionKey("transfer-123")).toBe("bybit:transfer-123"));
});