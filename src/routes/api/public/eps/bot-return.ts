import { createFileRoute } from "@tanstack/react-router";

/**
 * Landing page for an EPS hosted checkout started inside the Telegram bot.
 * The query string is only a hint — `settleEpsBotPayment()` always re-verifies
 * the transaction with EPS before anything is credited or delivered.
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
  const dep = url.searchParams.get("dep");
  const mtid = (
    url.searchParams.get("mtid") ??
    url.searchParams.get("merchantTransactionId") ??
    url.searchParams.get("MerchantTransactionId") ??
    url.searchParams.get("merchantTransactonId") ??
    ""
  ).trim();
  const state = (url.searchParams.get("state") ?? "").trim();

  const { getSettings } = await import("@/lib/bot/engine.server");
  const settings = await getSettings().catch(() => ({}) as Record<string, string>);
  const botLink = (settings["bot_link"] || "https://t.me/QORIX3_bot").trim();

  if (state === "cancel")
    return page("Payment cancelled", "No money was taken. You can start a new payment any time.", botLink);

  if (dep || mtid) {
    const { settleEpsBotPayment } = await import("@/lib/bot/engine.server");
    const r = await settleEpsBotPayment(dep, mtid || null);
    if (r.ok)
      return page("Payment received", "Your payment is confirmed. Open the bot to continue.", botLink);
  }

  if (state === "fail")
    return page("Payment failed", "The bank or wallet declined this payment. Nothing was charged.", botLink);

  return page(
    "Thanks!",
    "We are confirming your payment with EPS. Open the bot and tap the verify button — it usually takes less than a minute.",
    botLink,
  );
}

export const Route = createFileRoute("/api/public/eps/bot-return")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
