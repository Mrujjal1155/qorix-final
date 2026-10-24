<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Deliver stock, supplier, price, and new-product alerts through `stock_notification_events` with per-destination checkpoints and a separate authenticated notify request in the existing 15-second schedule; this prevents supplier polling and slow Telegram replies from blocking each other.
- Keep Telegram alert attempts short and retry interrupted events without a permanent attempt limit; a temporary outage must not silently discard an alert.
- After website-admin stock uploads, attempt an immediate service-role queue drain without bypassing the durable event; scheduled delivery remains the retry fallback when it fails.

- In-house stock counts come from `stock_counters`, kept exact by a trigger on `stock_items` (+1 add / -1 sold or deleted); `stock_counts()` reads it so bot clicks never scan thousands of items.
- Admin stock extraction uses server-authorized, service-role-only atomic RPCs and per-admin export receipts containing IDs only; deletion locks and rechecks every exported row so sold stock cannot be removed, and original TXT content stays unmodified.
- Scheduled supplier sync skips parsing/matching/snapshot RPC when the supplier reply's SHA-256 fingerprint matches the last fully applied one, but forces a full run every 2 minutes and on manual/webhook runs; this cuts CPU without letting DB-side changes stay stale.
- Reseller single-product GET uses bounded per-isolate caches (auth 30s keyed by API-key hash, product 10s keyed by reseller id + discount + product id) and throttled last_used_at writes; order/balance/transaction endpoints always authenticate live so purchases stay real-time.
- Manual in-house products with `manual_stock_limited` keep their admin-set count in `stock_counters` and `take_manual_stock()` reduces it per paid order; unlimited stays the default so older manual products keep working.
- Bot pre-orders are wallet-paid order rows with status `preorder`, drained oldest-first by `fulfillPreorders` (row lock via status flip to `preorder_processing`) after stock uploads and on every scheduled tick; this keeps serial delivery durable without a separate queue table.
- Keep Binance amount generation and matching in a pure shared helper with focused tests so direct checkout, wallet deposits, reseller top-ups and scheduled verification enforce the same payment rule.
- Send Telegram post-delivery appreciation through the shared credential-delivery helper only after Telegram accepts the complete delivery, so automatic, manual and retry paths remain consistent.
- OxaPay (crypto) is off by default (`oxapay_enabled`); website orders use order_id `W-<orders.id>`, bot wallet deposits `D-<binance_deposits.id>`, and every credit re-reads the invoice from OxaPay after HMAC check, so a forged webhook can never mark anything paid.
- Bot OxaPay visibility and new payment attempts read current narrow gateway settings rather than the general bot cache; wallet and product checkout share the wallet UI registry icon exposed in Bot Admin payment settings. Direct checkout preserves its snapshot on the deposit row and uses the existing verified settlement/fulfillment path so payment rules remain consistent.
- Checkout payment branding uses local imported image assets inside design-system selection buttons; artwork changes must not affect gateway availability or payment handlers.
- Public product readers use the server-only `public_products` safe projection; raw `products` remains admin-only through RLS, preventing supplier identifiers and costs from reaching visitors.
- Reseller product/order responses use explicit safe projections and fixed client-safe database failure messages; internal query errors must not disclose supplier or database diagnostics.
- Customer order history uses the service-role-only safe RPC after verified caller authentication; customers must not receive raw orders.meta, while admin RLS access remains intact.
- Reseller webhook saving and sending share HTTPS/public-DNS checks and never follow redirects; DNS preflight does not pin resolution and must not be represented as complete DNS-rebinding protection.
- Public payment cron routes must fail closed and accept scheduler credentials only in headers, never URLs.
- Fulfill charged reseller own-stock orders through the service-role-only atomic stock/order RPC in normal purchase and recovery; run bounded recovery on the existing notify tick so interruptions cannot cause repeat debits or orphaned stock claims.
- Telegram Shop favorites use the entire visibility/availability-filtered catalogue, grouped and paginated by the shared pure helper before applying user prices; legacy saved picks do not restrict this list, so new products appear automatically and distinct same-name rows remain intact.
- Telegram category visibility and stock filtering use the pure bot catalogue helper: keep empty active channel-permitted categories, load sold-out rows only for valid category browsing, and filter availability explicitly for favorites/All Products so purchase and preorder handling remain unchanged.
- Admin supplier/reseller colour chips take their hues from the shared helpers in `src/lib/supplier-colors.ts` so one supplier keeps one colour on every admin screen; new screens import them instead of redefining a palette.
- The Telegram price-list post is built by the pure `src/lib/product-list.ts` builder and sent with `sendRichMessage` (rich Markdown table), falling back to a plain HTML list; admin-editable list emojis live in `bot_settings` as `plist_emoji_*` so preview, send and tests share one format.
- Gateway bot checkouts settle wallet credit, original-order debit and paid status through the service-role-only atomic settlement RPC; expiry locks the same deposit first to prevent paid/unpaid races. Paid checkout pricing comes from reserved orders, and unavailable products retain payment in the wallet.
- EPS IPNs dispatch to bot or website settlement by stored transaction IDs and always reverify remotely; wallet credit excludes payer fees and uses the requested USD amount. Existing payment sweeps recheck late EPS attempts before expiry.
- Order timestamps retain stored UTC instants and use a shared explicit display timezone default instead of browser-local or Karachi fallback.
- Admin in-house retry uses a service-role-only atomic stock/order RPC and reuses saved delivery on subsequent attempts; unpaid/refunded orders cannot claim stock and retry never debits a wallet.
- Telegram live update channel uses DB triggers into live_update_events, drained on the existing notify tick; triggers swallow errors so a channel problem never blocks purchases or top-ups. Purchase posts carry a pure-helper Buy Now button (`livePostKeyboard`) linking to the configured bot username; top-up and member posts stay plain.
- Supplier sync never overwrites an existing supplier product's texts (name, description, important_note, quick_guide, image_url, delivery_time, details) — patches come from the pure `existingProductSyncPatch` in `src/lib/suppliers/sync-patch.ts` (stock, price, supplier-off `is_active: false` only) so bot-admin text edits survive every sync; new products still receive supplier texts when first listed.
