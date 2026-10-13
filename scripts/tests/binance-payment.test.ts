import { describe, expect, test } from "bun:test";
import { binancePaymentAmount, exactBinanceAmount } from "../../src/lib/binance-payment";

describe("ID-based Binance payments", () => {
  test("a $0.04 purchase requires 0.04 USDT, without a random suffix", () => {
    for (let i = 0; i < 100; i++) expect(binancePaymentAmount(0.04)).toBe(0.04);
  });
  test("accepts only the exact required amount", () => {
    expect(exactBinanceAmount(0.04, Number("0.04000000"))).toBe(true);
    expect(exactBinanceAmount(0.04, 0.0411)).toBe(false);
    expect(exactBinanceAmount(0.04, 0.03)).toBe(false);
    expect(exactBinanceAmount(0.04, 0.05)).toBe(false);
    expect(exactBinanceAmount(0.04, 0.040000001)).toBe(false);
  });
  test("preserves the chosen wallet deposit amount", () => {
    expect(binancePaymentAmount(10.25)).toBe(10.25);
    expect(binancePaymentAmount(1.424)).toBe(1.424);
  });
  test("rejects invalid payment amounts", () => {
    expect(() => binancePaymentAmount(0)).toThrow();
    expect(exactBinanceAmount(NaN, NaN)).toBe(false);
    expect(exactBinanceAmount(Infinity, Infinity)).toBe(false);
  });
});