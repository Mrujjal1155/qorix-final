import { describe, expect, test } from "bun:test";
import { addressHex, chainAddress, chainUnits, chainTxid, chainTransactionKey, matchesChainPayment, CHAIN_TOKEN, type ChainTransfer } from "../../src/lib/blockchain-payment";
const address = "0x1111111111111111111111111111111111111111";
const txid = `0x${"a".repeat(64)}`;
const claim = { address, txid, amount: "10.25", since: 1000, until: 3000 };
const row: ChainTransfer = { txid, sender: "2".repeat(40), receiver: "1".repeat(40), units: 10250000000000000000n, timestamp: 2000, confirmed: true, token: CHAIN_TOKEN.bep20 };
describe("self-custody USDT payment rules", () => {
  test("only exact BEP20 USDT amount qualifies", () => { expect(matchesChainPayment("bep20", row, claim)).toBe(true); for (const units of [row.units - 1n, row.units + 1n]) expect(matchesChainPayment("bep20", { ...row, units }, claim)).toBe(false); });
  test("TRC20 uses exact six decimal units", () => expect(chainUnits("10.25", "trc20")).toBe(10250000n));
  test("BEP20 keeps all eighteen decimals without number rounding", () => expect(chainUnits("10.250000000000000001", "bep20")).toBe(10250000000000000001n));
  test("wrong contract never qualifies", () => expect(matchesChainPayment("bep20", { ...row, token: "0x" + "0".repeat(40) }, claim)).toBe(false));
  test("wrong receiving wallet never qualifies", () => expect(matchesChainPayment("bep20", { ...row, receiver: "3".repeat(40) }, claim)).toBe(false));
  test("unfinalized payments stay unpaid", () => expect(matchesChainPayment("bep20", { ...row, confirmed: false }, claim)).toBe(false));
  test("old and future transfers do not qualify", () => { for (const timestamp of [999, 3001]) expect(matchesChainPayment("bep20", { ...row, timestamp }, claim)).toBe(false); });
  test("TXID must match", () => expect(matchesChainPayment("bep20", row, { ...claim, txid: `0x${"b".repeat(64)}` })).toBe(false));
  test("network identifiers are distinct", () => { expect(chainTransactionKey("bep20", txid)).toBe(`chain:bep20:${txid}`); expect(() => chainTxid("trc20", txid)).toThrow(); });
  test("valid TRON address checksum and hex conversion", () => expect(addressHex("trc20", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(CHAIN_TOKEN.trc20));
  test("invalid TRON checksum is rejected", () => expect(() => chainAddress("trc20", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6s")).toThrow());
});