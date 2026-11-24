/** Two decimals normally; up to four when a price needs them (e.g. 0.025). */
export function priceFixed(n: unknown): string {
  const v = Math.round(Number(n ?? 0) * 10000) / 10000;
  if (!Number.isFinite(v)) return "0.00";
  const two = v.toFixed(2);
  return Math.abs(Number(two) - v) < 1e-9 ? two : String(Number(v.toFixed(4)));
}
export const usdPrice = (n: unknown) => `$${priceFixed(n)}`;
