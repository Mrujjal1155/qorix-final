/**
 * In-bot reseller API quick start (Telegram HTML). Display-only: always uses the
 * <your_api_key> placeholder — a real key must never be placed in this text.
 */
export const RESELLER_API_BASE = "https://qorixlab.com/api/public/reseller/v1";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function apiQuickGuideText(): string {
  const B = RESELLER_API_BASE;
  const P = "/api/public/reseller/v1";
  const pre = (s: string) => `<pre>${esc(s)}</pre>`;
  return [
    "🔗 <b>Quick start</b>",
    "━━━━━━━━━━━━━━━━━━",
    "Three steps to your first call.",
    "",
    "1. Open your API account in this section and tap <b>Show Full Key</b> to copy your key. Keep it private.",
    "",
    "2. Send it on every request as a header:",
    pre("Authorization: Bearer <your_api_key>"),
    "3. Try it — this returns your balance:",
    pre(`curl -H "Authorization: Bearer <your_api_key>" \\\n  ${B}/me`),
    "🖥 <b>The calls you'll use most</b>",
    pre(
      [
        `GET  ${P}/me — your balance & account`,
        `GET  ${P}/products — browse & prices`,
        `GET  ${P}/products/{id} — one product`,
        `POST ${P}/orders — buy it`,
        `GET  ${P}/orders — your orders`,
        `GET  ${P}/orders/{id} — track an order`,
        `GET  ${P}/transactions — wallet history`,
      ].join("\n"),
    ),
    "🛒 <b>Buying, in full</b>",
    pre(
      `curl -X POST ${B}/orders \\\n  -H "Authorization: Bearer <your_api_key>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"product_id": "<product_id>", "quantity": 1, "external_ref": "<your_unique_ref>"}'`,
    ),
    "⚡️ It's charged to your wallet balance and delivered in the reply — the same stock you'd get here.",
    "",
    "⚠️ Send a unique <code>external_ref</code> on every order. If a connection drops and you retry with the same external_ref, you get the first result back instead of being charged twice.",
    "",
    "⚠️ A key can spend your balance. Treat it like a password — never paste it anywhere public.",
  ].join("\n");
}
