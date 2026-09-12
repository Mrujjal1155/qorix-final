/**
 * Cloudflare execution context bridge.
 *
 * Telegram delivers updates for one chat strictly one after another: it only
 * sends the next update once our webhook answered the previous one. So every
 * millisecond of bookkeeping we do *before* returning makes the next tap feel
 * slower. Handing that work to `ctx.waitUntil()` lets the worker answer
 * immediately and finish the bookkeeping afterwards.
 */
type Ctx = { waitUntil?: (p: Promise<unknown>) => void };

let currentCtx: Ctx | null = null;

export function setExecutionCtx(ctx: unknown) {
  currentCtx = (ctx ?? null) as Ctx | null;
}

/**
 * Runs `work` after the response when the runtime supports it.
 * Returns true when the caller no longer needs to await it.
 */
export function backgroundWaitUntil(work: Promise<unknown>): boolean {
  try {
    if (typeof currentCtx?.waitUntil === "function") {
      currentCtx.waitUntil(work.catch(() => {}));
      return true;
    }
  } catch {
    /* ctx already closed → caller awaits instead */
  }
  return false;
}
