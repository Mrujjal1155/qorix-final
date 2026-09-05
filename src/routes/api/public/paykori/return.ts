import { createFileRoute } from "@tanstack/react-router";

/**
 * Success / cancel redirect target for the Pay Kori hosted checkout.
 * Like the webhook, the query string is only a hint — the payment is always
 * re-verified against the gateway before anything is credited.
 */
function page(title: string, body: string, botLink: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#e8ecf5;font-family:system-ui,sans-serif;padding:24px}
.card{max-width:420px;text-align:center;background:#141824;border:1px solid #232838;border-radius:16px;padding:28px}
a{display:inline-block;margin-top:18px;background:#2f6bff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600}</style>
</head><body><div class="card"><h1>${title}</h1><p>${body}</p><a href="${botLink}">Back to the bot</a></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

async function run(request: Request) {
  const url = new URL(request.url);
  const depId = url.searchParams.get("dep");
  const cancelled = url.searchParams.get("cancel") === "1";
  const transactionId = (
    url.searchParams.get("transaction_id") ??
    url.searchParams.get("transactionId") ??
    url.searchParams.get("trxId") ??
    ""
  ).trim();

  const { getSettings } = await import("@/lib/bot/engine.server");
  const settings = await getSettings().catch(() => ({}) as Record<string, string>);
  const botLink = (settings["bot_link"] || "https://t.me/QORIX3_bot").trim();

  if (cancelled) return page("Payment cancelled", "No money was taken. You can start a new payment any time.", botLink);

  if (transactionId || depId) {
    const { settlePaykoriTransaction } = await import("@/lib/bot/engine.server");
    if (transactionId) {
      const r = await settlePaykoriTransaction(transactionId, depId);
      if (r.ok) return page("Payment received", "Your wallet has been credited. Open the bot to continue.", botLink);
    }
  }
  return page(
    "Thanks!",
    "We are confirming your payment with the gateway. Open the bot and tap the verify button — it usually takes less than a minute.",
    botLink,
  );
}

export const Route = createFileRoute("/api/public/paykori/return")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
