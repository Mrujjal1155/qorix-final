/** ID-based payments never need a random amount suffix. */
export function binancePaymentAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid payment amount.");
  return amount;
}

/** Binance decimals and stored NUMERIC values are parsed to the same number.
 * No rounding or tolerance: even a fraction of a cent must match.
 */
export function exactBinanceAmount(expected: number, received: number): boolean {
  return Number.isFinite(expected) && Number.isFinite(received) && expected > 0 && expected === received;
}