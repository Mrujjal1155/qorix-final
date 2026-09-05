# Cloudflare Workers deploy (qorixlab.com)

## 1. One-time setup

```bash
bun add -d wrangler
bunx wrangler login
```

The domain `qorixlab.com` must already be added as a zone in the same
Cloudflare account (Websites → Add a site, then use Cloudflare nameservers at
your registrar).

## 2. Build-time env (.env in the repo — needed BEFORE build)

These are baked into the client bundle at build time:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
VITE_SITE_URL=https://qorixlab.com
```

## 3. Build

```bash
bun run build
```

Output: `dist/server/index.mjs` (worker) + `dist/client` (static assets).

## 4. Runtime secrets (server-side only, set in Cloudflare)

```bash
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_PUBLISHABLE_KEY
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put TELEGRAM_BOT_TOKEN
bunx wrangler secret put TELEGRAM_WEBHOOK_SECRET
bunx wrangler secret put BINANCE_API_KEY
bunx wrangler secret put BINANCE_API_SECRET
bunx wrangler secret put BINANCE_CRON_SECRET
bunx wrangler secret put PAYKORI_API_KEY
bunx wrangler secret put RESEND_API_KEY
bunx wrangler secret put RESEND_FROM
```

Non-secret vars (`SITE_URL`, `PRODUCTION_SITE_URL`) are already in
`wrangler.jsonc`.

## 5. Deploy

```bash
bunx wrangler deploy
```

`wrangler.jsonc` attaches the custom domains `qorixlab.com` and
`www.qorixlab.com`, so Cloudflare creates the DNS records and SSL itself.

## 6. Point the Telegram webhook at the domain

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://qorixlab.com/api/public/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## 7. Public endpoints on the live domain

- `https://qorixlab.com/api/public/telegram/*`
- `https://qorixlab.com/api/public/binance/auto-verify`
- `https://qorixlab.com/api/public/paykori/*`
- `https://qorixlab.com/api/public/reseller/*`
- `https://qorixlab.com/api/public/suppliers/*`

## 8. Smoke test

```bash
bun run scripts/domain-smoke-test.ts https://qorixlab.com
```
