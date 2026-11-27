/** Keep valid request behavior; normalize only malformed list limits. */
export function resellerOrderLimit(value: string | null) {
  const parsed = Number(value ?? 50);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.floor(parsed))) : 50;
}

export function isOrderRequestObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Order quantity must be a whole number 1–50; omitted means 1. Never clamp
 * silently: a clamped value would charge for a quantity nobody asked for. */
export function parseOrderQuantity(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 1;
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}
