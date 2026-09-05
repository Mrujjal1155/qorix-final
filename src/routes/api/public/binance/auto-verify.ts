import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-friendly endpoint that auto-approves Binance Pay / USDT deposits.
 * Point pg_cron (or any scheduler) at it every minute.
 * Protected by BINANCE_CRON_SECRET when that secret is configured.
 */
async function run(request: Request) {
  const secret = process.env["BINANCE_CRON_SECRET"];
  if (secret) {
    const url = new URL(request.url);
    const provided = request.headers.get("x-cron-secret") ?? url.searchParams.get("secret") ?? "";
    if (provided !== secret) return new Response("Unauthorized", { status: 401 });
  }

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
