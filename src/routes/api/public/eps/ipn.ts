import { createFileRoute } from "@tanstack/react-router";

/**
 * EPS IPN (server-to-server notification).
 *
 * EPS posts here when a payment finishes. The payload is only a hint:
 * `settleEpsPayment()` re-verifies the transaction directly with EPS before an
 * order is marked paid, so a forged POST can never confirm a payment.
 */
async function readIds(request: Request) {
  const url = new URL(request.url);
  const bag: Record<string, string> = {};
  let encrypted = "";

  const put = (k: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) bag[k.toLowerCase()] = v.trim();
    else if (typeof v === "number") bag[k.toLowerCase()] = String(v);
  };

  url.searchParams.forEach((v, k) => put(k, v));

  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    try {
      if (type.includes("application/json")) {
        const body = (await request.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(body ?? {})) put(k, v);
      } else {
        const form = await request.formData();
        form.forEach((v, k) => put(k, typeof v === "string" ? v : ""));
      }
    } catch {
      /* empty or unreadable body — query string may still carry the ids */
    }
  }

  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = bag[k.toLowerCase()];
      if (v) return v;
    }
    return "";
  };

  return {
    mtid: get("mtid", "merchantTransactionId", "merchantTransactonId", "MerchantTransactionId"),
    etid: get("EPSTransactionId", "epsTransactionId", "TransactionId", "transactionId"),
  };
}

async function run(request: Request) {
  const { mtid, etid } = await readIds(request);
  if (!mtid && !etid) {
    return Response.json({ ok: false, message: "Missing transaction id" }, { status: 400 });
  }

  const { settleEpsPayment } = await import("@/lib/eps-settle.server");
  const result = await settleEpsPayment(mtid, etid || null);

  // Always 200 so EPS does not hammer us; the body says what happened.
  return Response.json(
    { ok: result.ok, order_no: result.orderNo ?? null, message: result.reason ?? "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/public/eps/ipn")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
