# Website Deposit linked to the bot wallet (Mobile View)

## Goal
In Mobile View, the Deposit page works exactly like the bot: the customer sees their real bot wallet balance, total spent and membership, picks a gateway and pays inside the page (Binance Pay, Bybit, USDT TRC20/BEP20 open the same step-by-step payment message; link-based gateways such as bKash/EPS, card and Any Crypto open their payment link directly). The money lands in the same wallet the bot uses, so one balance works in both places.

Until everything is finished and checked, the current Deposit page stays as it is (buttons open the bot).

## Steps
1. **Connect website account to the bot wallet**
   - On the Deposit page a "Connect Telegram" button opens the bot with a one-time code (valid 10 minutes, single use).
   - The bot confirms "Website account connected"; from then on the page shows that wallet.
   - One website account ↔ one Telegram account; a "Disconnect" option stays available.
2. **WALLET message with real data**: Balance, Total Spent, Membership read from the bot wallet.
3. **Gateway screens exactly like the bot**
   - Amount choice → payment message (Order ID, 30-minute deadline, Pay ID / address, exact amount, IMPORTANT notice), Copy ID, Show QR (admin-uploaded QR), I paid → submit ID, Change Gateway, Cancel.
   - Link gateways (EPS, OxaPay, card) open their payment link straight away.
4. **Transaction History** in bot table style (deposits and purchases, with true status).
5. Turn on the new Deposit page only after a full check.

## Safety rules kept
- Uses the existing deposit records, verification and settlement — the same exact-amount match, single-use TXID, 30-minute deadline and 10-minute early grace; no second credit path.
- Only the signed-in, connected owner can see or top up that wallet; codes are single-use and expire.
- No balance is changed during building; no real payment test without your approval; nothing is published.

## Technical details
- New table for one-time link codes + a link column/table mapping auth user ↔ telegram_id (RLS on, service-role-only writes); bot `/start link_<code>` handler in the existing webhook.
- Authenticated server functions (requireSupabaseAuth) that create `binance_deposits`/gateway attempts for the linked telegram_id, reusing the existing Binance/Bybit/chain/EPS/OxaPay helpers and settlement RPCs.
- UI in `src/components/mobile/BotAccount.tsx`, behind a flag until verified.
