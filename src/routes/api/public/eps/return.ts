import { createFileRoute } from "@tanstack/react-router";

/**
 * Success / fail / cancel landing for the EPS hosted checkout.
 *
 * The query string is only a hint — `settleEpsPayment()` always re-verifies the
 * transaction with EPS before an order is marked as paid, so a hand-crafted URL
 * can never confirm a payment.
 */
function page(title: string, body: string, href: string, cta: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#e8ecf5;font-family:system-ui,sans-serif;padding:24px}
.card{max-width:440px;text-align:center;background:#141824;border:1px solid #232838;border-radius:16px;padding:28px}
a{display:inline-block;margin-top:18px;background:#2f6bff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600}</style>
</head><body><div class="card"><h1>${title}</h1><p>${body}</p><a href="${href}">${cta}</a></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

async function run(request: Request) {
  const url = new URL(request.url);
  const q = (...keys: string[]) => {
    for (const k of keys) {
      const v = url.searchParams.get(k);
      if (v && v.trim()) return v.trim();
    }
    return "";
  };

  const state = q("state");
  const mtid = q("mtid", "merchantTransactionId", "MerchantTransactionId", "merchantTransactonId");
  const etid = q("EPSTransactionId", "epsTransactionId", "EpsTransactionId", "TransactionId");

  if (state === "cancel") {
    return page("Payment cancelled", "No money was taken. You can start the checkout again any time.", "/store", "Back to the store");
  }

  if (!mtid) {
    return page("Payment reference missing", "We could not identify this payment. Please contact support with your order number.", "/track", "Track my order");
  }

  const { settleEpsPayment } = await import("@/lib/eps-settle.server");
  const result = await settleEpsPayment(mtid, etid || null);

  if (result.ok && result.orderNo) {
    return redirect(`/order/confirmation?order=${result.orderNo}&email=${encodeURIComponent(result.email ?? "")}`);
  }

  if (state === "fail") {
    return page(
      "Payment failed",
      `The bank or wallet declined this payment${result.reason ? ` (${escapeText(result.reason)})` : ""}. Nothing was charged — please try again.`,
      "/store",
      "Back to the store",
    );
  }

  return page(
    "Confirming your payment",
    `We are still confirming this payment with EPS${result.reason ? ` — ${escapeText(result.reason)}` : ""}. Your order page updates automatically once it clears.`,
    result.orderNo ? `/track?order=${result.orderNo}&email=${encodeURIComponent(result.email ?? "")}` : "/track",
    "Track my order",
  );
}

function escapeText(t: string) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const Route = createFileRoute("/api/public/eps/return")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
