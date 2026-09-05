# Cloudflare-এ নিজে হাতে লাইভ করার গাইড (Lovable-এ কিছু রাখা লাগবে না)

প্রজেক্টের সব সেটিং (`wrangler.jsonc`) আগেই তৈরি করা আছে। শুধু নিচের ধাপগুলো করুন।

## ১. GitHub-এ কোড push আছে কি না দেখুন
Lovable-এর GitHub রিপো (qorix.f.3) থাকলেই হবে — Cloudflare সেখান থেকেই নিজে build করবে।

## ২. Cloudflare-এ প্রজেক্ট তৈরি
1. Cloudflare Dashboard → **Compute (Workers)** → **Create** ক্লিক করুন
2. **Import a repository** বেছে নিন → GitHub connect করুন → রিপো `qorix.f.3` সিলেক্ট করুন
3. সেটিং দিন:
   - Build command: `bun run build`
   - Deploy command: `bunx wrangler deploy`
   - Root directory: `/`
4. **Create & Deploy** চাপুন

এতে API token, wrangler login — কিছুই লাগবে না।

## ৩. Secrets (Settings → Variables and Secrets → Add → type: Secret)
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `PAYKORI_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

যোগ করার পর **Deployments → Retry / Redeploy** দিন।

## ৪. ডোমেইন
`wrangler.jsonc`-এ `qorixlab.com` ও `www.qorixlab.com` custom domain হিসেবে দেওয়া আছে, তাই ডোমেইনটি Cloudflare-এ (nameserver সহ) যোগ থাকলে deploy-এর সময় নিজেই সেট হয়ে যাবে।
না হলে: Worker → **Settings → Domains & Routes → Add → Custom domain** → `qorixlab.com` এবং `www.qorixlab.com`।

## ৫. Telegram webhook (deploy শেষ হওয়ার পর একবার)
ব্রাউজারে এই লিংকটি খুলুন (`<BOT_TOKEN>` আর `<SECRET>` বসিয়ে):

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://qorixlab.com/api/public/telegram/webhook&secret_token=<SECRET>
```

## ৬. Supabase-এ URL সেট
Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://qorixlab.com`
- Redirect URLs: `https://qorixlab.com/**`
