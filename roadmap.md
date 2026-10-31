# Roadmap

- [ ] Add Bybit Pay beside Binance for Telegram and website with a dedicated admin credentials/settings section and automatic verification; awaiting approval and confirmation of supported Bybit payment account/API type.

- [x] Add category name editing and typed serial positioning with clear arrows; five ordering/validation tests pass and latest build OK. Name-only saves preserve category metadata.
- [ ] Verify category rename and serial save/readback in the signed-in admin; blocked by external unmanaged authentication.

- [x] Render the approved Telegram welcome as native ACCOUNT/WALLET/REFERRALS tables with configured premium emojis, existing inline/persistent buttons and a brief Join Community footer. Eleven focused sender/emoji/contact/navigation tests pass; latest build OK. No real customer messages sent.
- [ ] Verify native welcome table appearance in the deployed Telegram bot; requires deployment and an actual /start interaction, which cannot be visually verified through the web preview.

- [x] Add the shared previous/DarkPan admin selector in the header and login with browser persistence and route-scoped root tokens. Seven focused tests pass; live login switch, reload, 1122/390 layouts and storefront isolation pass with no runtime errors; latest build OK. Signed-in management pages remain unverified because external unmanaged authentication is unavailable.

- [x] Unify admin cards, typography, controls and body-mounted popups through one router-scoped DarkPan token set; storefront/reseller themes and business rules unchanged. Latest build OK; login at 390/1122/1280 widths has no overflow, isolated real Dialog/Select controls open/select/close with matching fonts/colors and no runtime errors; 2 sales and 5 retry tests pass.
- [ ] Verify every signed-in admin page and real product/order/ticket popup with live data; blocked by external unmanaged authentication. Current checks cover login and isolated UI controls, not authenticated management flows.

- [x] Prepare standalone admin-login/panel + complete Telegram bot source export under /tmp without modifying the live shop; explicit portable Vite/Nitro config builds, TypeScript passes and regression tests pass. Include safe manual admin bootstrap, fresh-project environment template, migrations/prerequisite DDL and separate authenticated scheduler setup. Fresh database replay and live admin/bot/payment checks require the new project's credentials/deployment and are documented in the ZIP.

- [x] Move the supplier API wallet cards to the very end of the dashboard scroll, keeping their card look, shared supplier colours and phone/desktop grid; a top rule separates them from the product counters. Build OK; signed-in visual check still blocked by external unmanaged authentication (browser shows Sign in).


- [x] Show every order as its own clearly separated card on phone and computer, with a Cards/Table toggle remembered between visits; card styles come from shared admin-order utilities and the dark theme keeps its deep blue/gold accent. Build and served CSS verified; signed-in UI check still blocked by external unmanaged authentication.

- [x] Add reseller forgot-password request and public recovery page without profile changes; 4 focused tests pass, browser verifies request with mocked email API and real missing-link rejection, build OK. Login/recovery stay open during maintenance.
- [ ] Verify real reseller recovery email and password update after deployment; blocked by external unmanaged authentication and unverified Supabase sender/redirect settings. Allow https://qorixlab.com/reset-password (and each preview origin's /reset-password) in Supabase Auth Redirect URLs; no real recovery email or password change attempted.

- [x] Target free 30-recipient/second pacing using six starts every 200 ms; fast claims expanded to 300 while preserving the shared lease. Seven focused tests pass and build OK. Paid broadcasts remain disabled; external deployment and measured live throughput remain blocked as listed below.

- [x] Clear unsent stock/product requests accumulated before 2026-10-25 09:41 UTC; readback confirms zero old waiting recipients. Preserve orders, balances, inventory and delivered history. Add service-only fast claim, shared lease, six-send paced waves, runtime-budget release and Telegram retry_after; six focused tests pass, build OK.
- [ ] Deploy and verify accelerated customer notices on qorixlab.com (explicitly requested 2026-10-25 10:01 UTC). Blocked: Cloudflare credentials are absent, Wrangler reports unauthenticated, and no workspace connection is available. The external schedule previously returned ten sends; no real stock/order created for testing.

- [x] Repair approved all-customer stock/product notifications: independent service-only recipient ledger, bounded fan-out and transient retry; subscriptions complete only after actual restock delivery; database snapshots retain removed products and counter triggers cover stock depletion/delete. Ten focused tests pass independently; RLS and claim grants checked.
- [ ] Verify all-customer notices on the deployed Telegram bot after the accelerated sender is deployed; qorixlab.com now sends customer notices but its previous ten-per-tick cap still causes delay. Requires external deployment and a real product/stock transition; no fake inventory or historical mass broadcast created.

- [x] Hide completed in-house Retry and allow it only for paid pending or blocked/failed automatic deliveries; 10 focused eligibility/retry tests pass and build OK. Signed-in order UI verification is blocked by external unmanaged account access (browser shows Sign in).

- [x] Correct global Telegram user statistics and paginate all users; track confirmed block/unblock, stopped and deactivated states separately from admin bans, with unknown historical states preserved. Database confirms 1,708 members and $248.67 total wallet; RLS stays enabled and contact writes are service-role-only.
- [x] Verify all 1,708 rows across pages, conservative evidence classification, actual mocked sender persistence and existing delivery/catalogue/live/product-list paths: 16 tests pass; build OK, no real messages sent.
- [ ] Verify signed-in Users totals/status display and live Telegram transitions after deployment (blocked by external unmanaged account access and live bot interaction; current browser shows sign-in).

- [x] Generate sequential product-list batches and send only the previewed batch; 8 focused tests pass (40 then 30 of 70, larger catalogues, group/user delivery, oversized rejection), build OK; no real messages sent.
- [ ] Confirm sequential generation and premium emoji rendering in signed-in admin/live Telegram (blocked by external unmanaged authentication and an approved live broadcast).

- [x] Replace the live purchase Buy Now cart with the exact purchased product's premium icon, keeping a plain button when absent; 12 focused tests pass, including the mocked scheduled sender for bot/website/reseller and retry after icon lookup failure; build OK, no real orders/messages sent.
- [ ] Confirm the product premium emoji on a new live channel purchase post (requires deployment and an actual Telegram sale; existing posts are unchanged).
- [x] Supplier sync now writes stock-only patches for existing products: name, description, important note, quick guide, image and detail rows are never overwritten, so bot-admin text edits survive every sync; 3 focused tests pass, build pending live verify.
- [ ] Verify a supplier product edited in the bot admin keeps its texts after the next scheduled supplier sync (requires live deployment and a real sync run).
- [x] Reseller API sales (api_bot/api_website) now appear in the live update channel as masked "New Purchase!" posts with Reseller Balance label; trigger updated via migration, 8 live-update tests pass.
- [x] Add the approved English community invitation and group/channel links to the Telegram welcome message; mocked home callback renders both clickable links and preserves quick actions; 27 category/favorites regressions pass; no real messages sent.
- [ ] Verify the English community invitation in the live Telegram chat (requires deployment and live Telegram access).

- [x] Show all active Telegram categories even without stock; show active sold-out products in red only inside valid categories, keeping favorites and All Products available-only; 27 focused tests cover rules and mocked real bot callbacks, build OK; no real messages or orders sent.
- [ ] Verify empty categories and red sold-out buttons in the deployed Telegram chat (requires deployment and live Telegram access).

- [ ] Verify a new real EPS bot checkout: record starting wallet balance, match the verified EPS payment to its original order, confirm stock delivery and no net extra wallet charge (requires the user's real payment and Telegram receipt; do not simulate success or repair historical orders).

- [x] Show every bot-visible available product in paginated favorites, with Gemini first, Lovable ascending credits next, and other brands grouped; retain distinct same-name products and existing prices/categories. Catalogue and stock reads are paginated; 25 focused tests pass and build OK.
- [x] Give Muse AI its own favorites group right after Lovable and before all other brands, so newly added Gemini Pro stays with the Gemini group first; 20 focused tests pass in the file.
- [ ] Verify all-products favorites and Next/Previous in the deployed Telegram chat (requires deployment and live Telegram access; no messages or orders sent).

- [x] Reorder all 55 existing Telegram favorites with Gemini first, Lovable next in ascending credit quantity, and other products afterward; database readback and 13 focused tests verify membership, prices and stock are unchanged. Shared sorting keeps future selections grouped on save and display.

- [x] Add paid-only in-house Retry using atomic stock/order fulfillment, without another debit or duplicate stock claims; scheduled bot recovery and EPS website delivery share its order lock.
- [x] Run 20 focused retry/payment/delivery regressions; verify service-role-only execution and build OK. #2362 remains cancelled/unpaid; no real delivery attempted.
- [ ] Verify signed-in admin Retry and real customer delivery (blocked by external unmanaged authentication and approved real delivery/deployment); transactional stock-shortage rollback not exercised against real inventory.

- [x] Fix approved EPS bot IPN routing, fee-free credit, snapshot-based late checkout settlement and explicit order timezones; preserve historical balances and deliveries.
- [x] Run 26 focused payment regressions and public endpoint checks; atomic settlement/expiry are service-role-only and RLS remains enabled.
- [ ] Verify the corrected full paid delivery on the deployed bot (requires deployment and an approved real payment); existing #2360/#2362 statuses and wallet balance are not repaired by this change.

- [x] Add in-house account extraction with quantity, original TXT export, two separate confirmation popups and atomic deletion of only the exported unsold accounts.
- [x] Verify extraction rules and database security: nine focused tests pass; both atomic RPCs reject anon/authenticated direct execution; no real stock exported or deleted.
- [ ] Verify the full export/delete flow with a signed-in admin (blocked by external unmanaged authentication).

- [x] Re-audit reported supplier payload exposure; storefront responses contain no private supplier fields, reseller projection already excludes IDs, and raw reseller stock/debit diagnostics are now replaced by safe errors. Product content and payment/order rules are unchanged.
- [x] Verify public response and database access regressions: 14 focused tests pass, both anonymous reseller product requests return 401, RLS remains enabled, database linter and build pass.
- [ ] Verify this update with a signed-in reseller and on the deployed site (blocked by external unmanaged authentication and deployment; no real orders placed).

- [x] Add admin-selected Telegram top products below the unchanged Shop category grid; four focused tests pass, build OK, no real orders. Admin page remains sign-in gated.
- [ ] Verify top-product saving with a signed-in admin and live Telegram display (requires external Supabase account access and deployment).
- [x] Show each product's supplier as its own colour chip in the Top Products list, with a colour legend; shared hue helpers plus three focused tests pass, build OK.
- [x] Make the supplier chips a filter (All / each supplier / In-house) with per-chip counts, combined with the search box; four focused tests pass, build OK.
- [ ] Confirm the supplier colour chips in the signed-in admin Top Products page (requires external Supabase admin access; no session can be minted here).

- [x] Complete charged own-stock reseller order #1611 without another debit; verified one $1.30 debit and authenticated API returns completed with one delivery item.
- [x] Make charged own-stock fulfilment atomic and include safe recovery in the existing notify schedule; repeat live call changes nothing, 17 focused tests pass, API docs updated.
- [ ] Verify charged reseller recovery on the production schedule after deployment (requires deployment); Vibex has no webhook, so its website must read GET /orders/:id to receive delivery.

- [x] Keep product descriptions, details and images unchanged; restrict this audit to supplier credentials/endpoints and unauthorized spending.
- [x] Audit supplier identity exposure across visitor, user, reseller, bot and API paths; propose verified security fixes for approval.
- [x] Apply approved supplier privacy and endpoint hardening; 26 focused tests, unauthenticated endpoint rejection, admin-policy preservation and database linter pass without real purchases.
- [ ] Verify supplier endpoint hardening with signed-in customer/reseller accounts and on the published deployment (requires external Supabase account access and deployment).
- [x] Close public supplier metadata exposure; anonymous access tests, storefront/product/SEO responses and database linter pass without real purchases.
- [ ] Verify the privacy update on the published site and signed-in reseller account (requires deployment and external Supabase account access).

- [x] Make Telegram quantity buttons (quantity picker and checkout "Change quantity") blue by default and expose them as their own admin colour slot.
- [x] Make the bot's payment-method buttons blue through the existing Wallet & payment colour slot, keeping Back red.


- [x] Add enabled OxaPay to Telegram product checkout and expose its shared Premium icon in Bot Admin payment settings; focused payment/icon tests pass without a real payment.


- [x] Add reference-based Binance and OxaPay checkout logo artwork; verify selection and layout without creating a real order.

- [x] Fix enabled OxaPay visibility in the bot using current gateway settings, without changing other payment methods.
- [x] Add the approved crypto label and bot-admin Premium icon support; verify focused tests.
- [ ] Verify OxaPay visibility and icon on the published bot (requires deployment and live bot access).

- [x] Remove Binance unique extra amounts and require exact USDT amount plus verified ID.
- [x] Show immediate professional English verification status after ID submission.
- [x] Add a thank-you and invitation after successful Telegram delivery; run focused tests.
- [ ] Verify the updated Binance payment and delivery messages on the live bot (requires deployment and an approved real payment).

- [x] Separate scheduled Telegram delivery from supplier polling in the existing 15-second tick, with bounded text-only sends and unlimited durable retries.
- [ ] Verify the bounded alert sender against the published Telegram bot after deployment (requires deployment).

- [x] Verify 15-second supplier sync reaches qorixlab.com successfully
- [x] Ensure only already-ON products send restock and low-stock alerts to group and bot
- [x] Normalize Vexoran, Canboso, and MailReader stock identifiers/counts
- [x] Treat products omitted from a complete supplier catalogue as sold out
- [x] Keep failed Telegram alerts queued and deliver channel/bot independently
- [x] Verify live supplier sync state, queue/log, TypeScript check, and build
- [ ] Verify the corrected Telegram delivery after the next Cloudflare deployment
- [x] Attempt website-admin stock alert delivery immediately after queuing, using the service-role sender while preserving scheduled retries.
- [ ] Verify a new website-admin stock upload reaches Telegram after deployment (requires a real upload and deployment; do not create test inventory).
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
- [x] Create an order ID at gateway checkout, auto-fail unpaid orders after 30 minutes, and let admin mark paid or refund the paid amount to the wallet
- [x] Use supplier cost—not customer selling price—for supplier-wallet checks on every fulfilment path
- [x] Add a persistent blue Telegram bottom menu for Products, Deposit, and My Orders with configurable Premium Emoji icons



- [x] Move supplier API balances to the very top of the dashboard as a compact strip (2 columns on phones, 5 on wide screens), keeping each supplier's shared colour and red text for empty/failed balances; build OK and the phone/desktop strip layout verified in an isolated render.
- [ ] Confirm the compact supplier balance strip in the signed-in dashboard (blocked by external unmanaged authentication — no session can be minted here).
- [x] Hide the Supplier API wallets card and its balance polling from the admin Orders page; dashboard wallet cards unchanged. Build OK; signed-in Orders view not checked because the project uses external unmanaged authentication.
