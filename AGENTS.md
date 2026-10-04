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
- Scheduled supplier sync skips parsing/matching/snapshot RPC when the supplier reply's SHA-256 fingerprint matches the last fully applied one, but forces a full run every 2 minutes and on manual/webhook runs; this cuts CPU without letting DB-side changes stay stale.
