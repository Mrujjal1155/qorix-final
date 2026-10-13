# OxaPay crypto gateway যোগ (শুরুতে বন্ধ অবস্থায়)

## কী হবে (সহজ ভাষায়)
- Admin → Settings-এ নতুন **OxaPay** কার্ড: Merchant API Key বসানোর ঘর, "Enable OxaPay" টিক (শুরুতে বন্ধ), "Test connection" বাটন, আর সবুজ "API Active" / লাল "Not connected" চিহ্ন।
- টিক বন্ধ থাকলে website বা bot-এ কোথাও OxaPay দেখাবে না, আর কেউ জোর করে চেষ্টা করলেও order নেওয়া হবে না।
- চালু করলে:
  - **Website checkout**: নতুন অপশন "Pay with Crypto (OxaPay)" — চাপলে OxaPay-এর নিজস্ব পেমেন্ট পেজ খুলবে, customer যেকোনো coin (USDT, BTC, LTC, TRX ইত্যাদি) দিয়ে দিতে পারবে। TXID লেখার দরকার নেই।
  - **Telegram bot**: wallet deposit-এ "Crypto (OxaPay)" বাটন — amount দিলে পেমেন্ট লিংক আসবে; টাকা পেলে নিজে থেকে balance যোগ হবে।
- Binance Pay, EPS/PayKori, পুরোনো crypto address — সব আগের মতোই থাকবে, কিছুই বদলাবে না।

## নিরাপত্তা (fake order আটকানো)
- OxaPay থেকে আসা বার্তা (webhook) শুধু তখনই মানা হবে যখন তার HMAC-SHA512 সিল আপনার API Key দিয়ে মেলে।
- তারপরও আমরা নিজে OxaPay-কে আবার জিজ্ঞেস করব (Payment Information API) — status "paid"/"manual_accept" এবং amount পুরো মিললেই paid। "paying", "underpaid", "expired" হলে paid হবে না।
- একই payment দুইবার গোনা যাবে না (track_id একবারই ব্যবহার)।
- order_id মিলতে হবে — অন্য order-এর payment দিয়ে এই order paid হবে না।
- কম টাকা (underpaid) দিলে order pending থাকবে, admin দেখতে পাবে।
- Payment লিংক ৬০ মিনিট পর বাতিল।

## চালু করার আগে আপনার করণীয় (পরে)
1. OxaPay account → Merchant API Key তৈরি করে Admin Settings-এ বসানো।
2. Test connection চাপা → সবুজ দেখলে টিক দিয়ে Save।
3. ছোট amount দিয়ে একটা আসল test পেমেন্ট — real order-এর আগে আমি সতর্ক করব।
4. Cloudflare firewall OxaPay-এর webhook আটকালে OxaPay-এর IP whitelist লাগতে পারে।

## Technical details
- `src/lib/oxapay.server.ts`: `POST https://api.oxapay.com/v1/payment/invoice` (header `merchant_api_key`; amount USD, lifetime 60, order_id, callback_url, return_url, email), `GET /v1/payment/{track_id}`, HMAC-SHA512 verify (raw body, header `HMAC`, timing-safe)।
- Settings keys in `bot_settings`: `oxapay_enabled` (default off), `oxapay_api_key` (server-only, admin UI masked), env fallback `OXAPAY_MERCHANT_KEY`।
- Server fns: `getOxapayStatus`, `startOxapayCheckout` (website; same stock checks as EPS; order `payment_method: "oxapay"`, `txid: OXA-<id>`), admin `saveOxapay`/`testOxapay`।
- Webhook route `src/routes/api/public/oxapay/webhook.ts`: verify HMAC → re-fetch payment info → settle; always respond `ok` (200) after verification।
- Return route `/api/public/oxapay/return` → re-verify then redirect to `/order/confirmation`।
- Settlement: replay guard via `binance_used_txs` (`oxapay:<track_id>`), reuse existing website delivery path (same as EPS settle); bot deposits credit wallet via existing deposit/payment row logic।
- Bot: new deposit button only when enabled; checks `oxapay_enabled` on callback too।
- Focused test for: paid-status rule, amount coverage, HMAC check।
