import { createFileRoute } from "@tanstack/react-router";

/**
 * Customer alert/broadcast delivery in its own Worker invocation. Workers allow
 * only 6 simultaneous connections per invocation; sharing the notify tick with
 * eight other jobs capped sends near 5/s. The DB lease still allows one claim per 15s.
 */
async function run({ request }: { request: Request }) {
  const { isCronAuthorized } = await import("@/lib/cron-auth.server");
  if (!(await isCronAuthorized(request))) return new Response("Unauthorized", { status: 401 });
  const { drainStockAudience } = await import("@/lib/bot/stock-audience.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const started = Date.now();
  try {
    const result = await drainStockAudience(supabaseAdmin);
    return Response.json({ ok: true, ms: Date.now() - started, ...result });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/alerts/drain")({
  server: { handlers: { GET: run, POST: run } },
});
