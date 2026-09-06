import { createFileRoute } from "@tanstack/react-router";

/**
 * Telegram delivery only — never polls a supplier API.
 * Kept separate from /suppliers/sync so a slow supplier catalogue can never
 * starve the alert queue. Safe to call as often as the scheduler likes: work
 * per run is bounded and every card is claimed before it is sent.
 */
async function run() {
  const { drainAllNotifications } = await import("@/lib/suppliers/sync.server");
  try {
    const res = await drainAllNotifications();
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/suppliers/notify")({
  server: { handlers: { GET: run, POST: run } },
});
