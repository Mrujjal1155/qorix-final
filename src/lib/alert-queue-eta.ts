/** Default admin send rate (alert_send_rate_per_minute); Telegram caps free sends at 1800/min. */
export const NOTICES_PER_MINUTE = 1500;

/** Minimum minutes to clear the waiting customer notices (best case, no Telegram slowdowns). */
export function minQueueMinutes(pendingRecipients: number, pendingEvents = 0, ratePerMinute = NOTICES_PER_MINUTE): number {
  const rate = Number.isFinite(ratePerMinute) && ratePerMinute > 0 ? Math.min(1800, ratePerMinute) : NOTICES_PER_MINUTE;
  const r = Math.max(0, Math.floor(pendingRecipients));
  const e = Math.max(0, Math.floor(pendingEvents));
  if (r === 0 && e === 0) return 0;
  // Pending events must first post to the group; that takes at least one tick.
  return Math.max(e > 0 ? 1 : 0, Math.ceil(r / rate));
}

export function formatEta(minutes: number): string {
  if (minutes <= 0) return "Nothing waiting";
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}
