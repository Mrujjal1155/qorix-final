# Website: Guest + Connect Telegram (bot-style)

## What the customer sees
1. Website opens -> **Start** button (as now).
2. After Start, two buttons:
   - **Continue as Guest** -> menu opens immediately. No account, no ID. Can browse, buy, pay and track orders exactly as guests do today.
   - **Connect Telegram** -> opens our bot with one tap -> customer presses **Start/Authorize** in the bot -> website automatically signs in as that same Telegram user.
3. Telegram-connected customer sees the **same bot account**: same user ID, wallet balance, spending, membership, previous orders, deposits, and the bot's own referral link.
4. Guest: referral section hidden, with a note: "Referral earning er jonno Telegram connect korun."
5. Disconnect / Logout button for connected users returns to the Start screen.

## Stays exactly as before
- Reseller login, reseller panel/dashboard, Admin dashboard, all money/payment logic.
- API docs content (only its look stays bot-style, as already done).
- Old email/password login is removed from the customer Start screen (only Guest + Telegram), but reseller login is untouched.

## How it works (technical)
- Reuse the existing one-time `web_link_codes` + bot `/start wl_<code>` flow (10-minute, single use). No Telegram domain setup needed, no bot token in the browser.
- New server function: after the bot confirms the code, find/create a hidden website account tied to that `telegram_id` (one per Telegram user, unique), and return a signed-in session to the browser. Wallet/orders/deposits are read from the bot user record, never copied, so balances cannot change or duplicate.
- Guest mode = no session; stored only as a local "guest" choice to skip the chooser.
- Referral page/section: shows bot referral link when `telegram_id` is linked; otherwise hidden note.
- No balance changes, no live payments, no publish.

## Risk notes
- If a customer already has an email account linked to the same Telegram ID, the Telegram login opens that same account (no duplicate).
- Admin and reseller routes are not touched.
