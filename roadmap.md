# Roadmap

- [x] Verify 15-second supplier sync reaches qorixlab.com successfully
- [x] Ensure only already-ON products send restock and low-stock alerts to group and bot
- [x] Normalize Vexoran, Canboso, and MailReader stock identifiers/counts
- [x] Treat products omitted from a complete supplier catalogue as sold out
- [x] Keep failed Telegram alerts queued and deliver channel/bot independently
- [x] Verify live supplier sync state, queue/log, TypeScript check, and build
- [ ] Verify the corrected Telegram delivery after the next Cloudflare deployment
- [x] Load all paginated Bot Admin settings so EPS does not fall back to legacy Pay Kori after 1,000 rows
- [x] Fix immediate Premium Emoji refresh and add separate MFS/Card icon slots for EPS payment rows
- [x] Prevent duplicate stock alerts across overlapping sync requests
- [x] Alert below 5 units (4 or fewer), while keeping sold-out transitions distinct
- [x] Refresh open storefront stock automatically
- [x] Bound Telegram fan-out and persist progress across automatic runs
- [x] Batch listed-product updates to stay below Cloudflare request limits
- [x] Add a Cloudflare scheduled fallback so stock and prices refresh without admin clicks- [x] Send up to 6 stock cards per supplier per run and drain all four suppliers in parallel
- [x] Retry stalled alert claims after 45s instead of 120s
- [x] Announce admin-added products and admin-removed products to channel + bot DMs
- [x] Deliver queued Telegram alerts before catalogue polling on every tick
- [x] Queue stock/price events before the snapshot write so no transition is lost
- [x] Announce real price changes (drop by default, rises optional)
- [x] Retry alerts with exponential backoff and drop after 8 failures with a log
- [x] Admin auto-sync health panel (last run, waiting alerts, recent delivery log)
- [x] Cut over supplier alerts to a clean live-only baseline and purge all historical queues/logs
- [x] Stop treating temporarily omitted catalogue rows as sold out/restocked
- [x] Serialize each supplier's cron/webhook sync and deduplicate admin alerts by transition
- [x] Checkpoint each Telegram channel/DM recipient before sending so worker retries cannot duplicate supplier alerts

- [x] Qamify (api.qamify.site) reseller API audit: full product details synced (description verbatim, Total sold / Max per order / Units per item), reseller-private fields hidden, details now shown in bot card too, multi-item delivery verified live (order RA-6BB7CFD5E9, 2 items).

- [x] Vexoran API audit: service products (no stock tracking) no longer show sold out, bulk delivery split into one entry per unit, push webhook receiver /api/public/suppliers/webhook + admin "Realtime" button.

## Supplier audit — MailReader (done 2026-09-06)
- Verified live against docs: Bearer auth, ?action=products/balance/order, 23 products mapped.
- Fixed bug: products without bulk_discounts got min_qty=0 (false ?? 1 → false); now falls back to 1.
- detailsFromRaw maps description + delivery_instruction (guide) + delivery_media (image); no supplier images sent, uploaded images preserved.
- splitBulkDelivery verified for MailReader newline-joined multi-item delivery (1 line per unit & blank-line blocks).
- DB verified: 4 active site products with images/desc/guide; catalogue 25 rows; stock syncing.
- tsgo + build OK.

## Supplier API parity audits
- [x] Qamify — endpoints/auth/details/delivery verified
- [x] Vexoran — service stock, delivery split, push webhook receiver + admin Realtime button
- [x] MailReader — min_qty default fix, 23 products live-verified
- [x] Canboso (FatBunny Hub) — 217 products live-verified; emoji slug guard; customer_email forwarded for slot products
