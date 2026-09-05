import { createFileRoute } from "@tanstack/react-router";

/**
 * Pay Kori server-to-server webhook.
 *
 * The payload is UNTRUSTED: anybody can POST here. We only read the
 * transaction id out of it and then ask the gateway (`payment/verify`) what
 * really happened. Nothing is credited unless the gateway itself reports the
 * transaction as completed with an amount that covers the deposit request, and
 * each transaction id can only ever be credited once.
 */
async function run(request: Request) {
  let payload: any = {};
  try {
    const raw = await request.text();
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const transactionId = String(
    payload.transactionId ?? payload.transaction_id ?? payload.trxId ?? "",
  ).trim();
  const depId = String(payload.order_id ?? payload.orderId ?? "").trim() || null;

  if (!transactionId) return Response.json({ ok: false, error: "missing transactionId" }, { status: 400 });

  const { settlePaykoriTransaction } = await import("@/lib/bot/engine.server");
  const result = await settlePaykoriTransaction(transactionId, depId);
  // Always 200 so the gateway does not hammer retries on unrelated states.
  return Response.json({ ok: true, result });
}

export const Route = createFileRoute("/api/public/paykori/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
    },
  },
});
