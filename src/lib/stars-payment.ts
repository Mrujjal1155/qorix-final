/** Telegram Stars pricing. Default follows Telegram's developer rate (1 Star ≈ $0.013 → 77 Stars per $1). */
export const DEFAULT_STARS_PER_USD = 77;

export function starsEnabled(settings: Record<string, string>) {
  return (settings["stars_enabled"] ?? "1") !== "0";
}

export function starsPerUsd(settings: Record<string, string>) {
  const n = Number(settings["stars_per_usd"]);
  return Number.isFinite(n) && n > 0 && n <= 10000 ? n : DEFAULT_STARS_PER_USD;
}

/** Whole Stars, rounded up, never below 1 (so even $0.01 is payable). */
export function usdToStars(usd: number, rate: number) {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const cents = Math.round(usd * 100);
  return Math.max(1, Math.ceil((cents * rate) / 100 - 1e-9));
}

export function starsPayload(depositId: string) { return `stars:${depositId}`; }
export function parseStarsPayload(payload: unknown) {
  const m = /^stars:([0-9a-f-]{36})$/i.exec(String(payload ?? ""));
  return m ? m[1]! : null;
}
