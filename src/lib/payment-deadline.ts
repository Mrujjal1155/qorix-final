export const PAYMENT_WINDOW_MS = 30 * 60_000;
export function paymentDeadline(createdAt: string, expiresAt?: string | null): number {
  const created = Date.parse(createdAt);
  const stored = expiresAt ? Date.parse(expiresAt) : created + PAYMENT_WINDOW_MS;
  return Math.min(created + PAYMENT_WINDOW_MS, stored);
}
export function paymentAttemptOpen(row: { status: string; created_at: string; expires_at?: string | null }, now = Date.now()): boolean {
  const deadline = paymentDeadline(row.created_at, row.expires_at);
  return row.status === "pending" && Number.isFinite(deadline) && now < deadline;
}