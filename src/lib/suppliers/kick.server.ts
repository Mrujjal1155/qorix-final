/**
 * Fire-and-forget supplier sync trigger.
 *
 * Cloudflare gives every request a small CPU budget. Running the full supplier
 * catalogue sync *inside* a page request (storefront load, admin poll, Telegram
 * update) used to blow that budget and Cloudflare answered the whole page with
 * "Error 1102 — Worker exceeded resource limits".
 *
 * Instead we ping our own sync endpoint and do not wait for it: the heavy work
 * then runs in its own worker invocation with its own fresh budget, while the
 * page renders instantly.
 */
import { resolveSiteOrigin } from "@/lib/site-url";

let lastKick = 0;
/** Never ping more than once every 20 seconds from one worker isolate. */
const KICK_MS = 20_000;

export function kickSupplierSync(path = "/api/public/suppliers/sync") {
  const now = Date.now();
  if (now - lastKick < KICK_MS) return;
  lastKick = now;
  try {
    const url = `${resolveSiteOrigin()}${path}`;
    void fetch(url, {
      method: "POST",
      headers: { "x-qorix-kick": "1" },
      signal: AbortSignal.timeout(1500),
    }).catch(() => {});
  } catch {
    /* never break the page for a background ping */
  }
}
