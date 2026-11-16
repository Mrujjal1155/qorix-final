import { processBuyOrders } from './buy-orders.server';

export const BUY_WATCH_INTERVAL_MS = 5000;
// Stop before the next minutely trigger so windows rarely overlap; claims stay atomic if they do.
export const BUY_WATCH_WINDOW_MS = 55000;
// The database scheduler calls the sync route every 15 seconds: checks at 0s, 5s and 10s of each call.
export const BUY_WATCH_TICK_WINDOW_MS = 15000;

type WatchDeps = {
  run?: (db: any) => Promise<{ checks: number; purchases: number }>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  windowMs?: number;
};

/** Runs stock checks on fixed 5-second marks inside one scheduled invocation. */
export async function runBuyWatchWindow(db: any, deps: WatchDeps = {}) {
  const run = deps.run ?? ((d: any) => processBuyOrders(d));
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const interval = deps.intervalMs ?? BUY_WATCH_INTERVAL_MS;
  const window = deps.windowMs ?? BUY_WATCH_WINDOW_MS;
  const start = now();
  let ticks = 0, checks = 0, purchases = 0;
  for (let mark = 0; mark < window; mark += interval) {
    const wait = start + mark - now();
    if (wait > 0) await sleep(wait);
    if (now() - start >= window) break;
    ticks++;
    try {
      const r = await run(db);
      checks += r.checks; purchases += r.purchases;
    } catch (e) {
      // A save failure after a purchase means reconciliation is needed: stop this window.
      console.error('Buy watch tick failed:', e);
      break;
    }
  }
  return { ticks, checks, purchases };
}
