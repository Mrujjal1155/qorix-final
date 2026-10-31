/** Scheduler runs once a minute and each run sends at most this many customer notices. */
export const NOTICES_PER_MINUTE = 300;

/** Minimum minutes to clear the waiting customer notices (best case, no Telegram slowdowns). */
export function minQueueMinutes(pendingRecipients: number, pendingEvents = 0): number {
  const r = Math.max(0, Math.floor(pendingRecipients));
  const e = Math.max(0, Math.floor(pendingEvents));
  if (r === 0 && e === 0) return 0;
  // Pending events must first post to the group; that takes at least one tick.
  return Math.max(e > 0 ? 1 : 0, Math.ceil(r / NOTICES_PER_MINUTE));
}

export function formatEta(minutes: number): string {
  if (minutes <= 0) return "Nothing waiting";
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}
