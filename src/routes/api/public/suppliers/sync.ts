import { createFileRoute } from "@tanstack/react-router";

/**
 * Throttled supplier catalogue sync for external schedulers (cron, uptime ping).
 * Safe to call as often as you like — it only really runs every 10 minutes.
 * Each call also runs a short supplier buy-order watch window (stock check every
 * 5 seconds), because the database scheduler calls this route every 15 seconds.
 */
async function startBuyWatch() {
  const [{ runBuyWatchWindow, BUY_WATCH_TICK_WINDOW_MS }, { supabaseAdmin }] = await Promise.all([
    import("@/lib/suppliers/buy-watch.server"),
    import("@/integrations/supabase/client.server"),
  ]);
  return runBuyWatchWindow(supabaseAdmin, { windowMs: BUY_WATCH_TICK_WINDOW_MS });
}

async function run({ request }: { request: Request }) {
  const { isCronAuthorized } = await import("@/lib/cron-auth.server");
  if (!(await isCronAuthorized(request))) return new Response("Unauthorized", { status: 401 });
  // Start the buy watch first so stock checks never wait for the catalogue sync.
  const watch = startBuyWatch().catch((e) => console.error("Supplier buy watch failed:", e));
  const { backgroundWaitUntil } = await import("@/lib/bg.server");
  const watchInBackground = backgroundWaitUntil(watch);
  const { maybeAutoSyncSuppliers } = await import("@/lib/suppliers/sync.server");
  try {
    const res = await maybeAutoSyncSuppliers();
    try {
      const { fulfillPreorders } = await import("@/lib/bot/preorder.server");
      await fulfillPreorders();
    } catch (e) {
      console.error("Pre-order drain failed:", e);
    }
    if (!watchInBackground) await watch;
    return Response.json({ ok: true, ...res });
  } catch (e) {
    if (!watchInBackground) await watch;
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/suppliers/sync")({
  server: { handlers: { GET: run, POST: run } },
});
