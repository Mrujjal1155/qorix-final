# Domain smoke test — qorixlab.com

Run this list after any domain, deploy, or SITE_URL change.
Automated part: `bun scripts/domain-smoke-test.ts [baseUrl]` (default `http://localhost:8080`).

## 1. Environment
- [ ] `.env` local: `VITE_SITE_URL` / `SITE_URL` = `http://localhost:8080`
- [ ] Production deploy: `SITE_URL` unset or `https://qorixlab.com`
- [ ] Supabase → Authentication → URL Configuration: Site URL `https://qorixlab.com`,
      Redirect URLs include `https://qorixlab.com/**` (+ localhost for dev)

## 2. Public pages resolve (200)
- [ ] `/` `/store` `/about` `/contact` `/faq` `/terms` `/privacy` `/refund`
- [ ] `/reseller` `/reseller/docs` `/reseller/start` `/track` `/auth`
- [ ] a product page `/store/<id>` (redirects to `?buy=false`, then 200)

## 3. SEO metadata
- [ ] every public page has `rel="canonical"` → `https://qorixlab.com/...` (self-referencing)
- [ ] `og:url` matches the canonical on the same page
- [ ] `/auth`, `/track`, `/reseller/start` carry `robots: noindex,follow`
- [ ] `/sitemap.xml` returns XML, all `<loc>` start with `https://qorixlab.com`
- [ ] `/robots.txt` contains `Sitemap: https://qorixlab.com/sitemap.xml`
      and disallows `/admin`, `/account`, `/auth`, `/reseller/start`, `/reseller/panel`

## 4. Email / auth redirects (always production domain)
- [ ] user signup verification email link → `https://qorixlab.com/`
- [ ] reseller signup verification email link → `https://qorixlab.com/reseller/panel`
- [ ] reseller approval invite email → `https://qorixlab.com/reseller/start?email=...`
- [ ] admin "Copy login link" copies the same production URL
- [ ] clicking each link lands signed-in, no `localhost` / preview host in the URL

## 5. Webhooks (must be publicly reachable)
- [ ] Admin → Webhook: Telegram webhook set to `https://qorixlab.com/api/...`, status OK
- [ ] Admin → Settings: Pay Kori webhook shows `https://qorixlab.com/api/public/paykori/webhook`
- [ ] a test payment callback reaches the endpoint (check order status changes)

## 6. Reseller API base
- [ ] `/reseller/docs` shows base `https://qorixlab.com/api/public/reseller/v1`
- [ ] reseller panel shows the same base
- [ ] `GET /api/public/reseller/v1/products` with a valid key returns JSON

## 7. Bot links
- [ ] Telegram bot product / store links point to `qorixlab.com`
- [ ] deep links open the correct product page

## 8. DNS / hosting (after publish)
- [ ] `qorixlab.com` and `www.qorixlab.com` both load over HTTPS
- [ ] one is Primary, the other redirects to it
- [ ] Project settings → Domains status is **Active**
