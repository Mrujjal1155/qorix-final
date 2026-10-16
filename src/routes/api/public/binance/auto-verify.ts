import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/**
 * Cron-friendly endpoint that auto-approves Binance Pay / USDT deposits.
 * Point pg_cron (or any scheduler) at it every minute.
 * Always requires scheduler authentication; missing configuration fails closed.
 */
async function run(request: Request) {
  const secret = process.env["BINANCE_CRON_SECRET"];
  let authorized = false;
  if (secret) {
    const provided = request.headers.get("x-cron-secret") ?? "";
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    authorized = a.length === b.length && timingSafeEqual(a, b);
  } else {
    const { isCronAuthorized } = await import("@/lib/cron-auth.server");
    authorized = await isCronAuthorized(request).catch(() => false);
  }
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  const { sweepBinanceDeposits } = await import("@/lib/bot/engine.server");
  const result = await sweepBinanceDeposits(true);
  return Response.json({ ok: true, ...result });
}

export const Route = createFileRoute("/api/public/binance/auto-verify")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
