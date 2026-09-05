import { createFileRoute } from "@tanstack/react-router";

/**
 * Throttled supplier catalogue sync for external schedulers (cron, uptime ping).
 * Safe to call as often as you like — it only really runs every 10 minutes.
 */
async function run() {
  const { maybeAutoSyncSuppliers } = await import("@/lib/suppliers/sync.server");
  try {
    const res = await maybeAutoSyncSuppliers();
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/suppliers/sync")({
  server: { handlers: { GET: run, POST: run } },
});
