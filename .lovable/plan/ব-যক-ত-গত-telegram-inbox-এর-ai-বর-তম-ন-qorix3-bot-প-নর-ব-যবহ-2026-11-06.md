# ব্যক্তিগত Telegram Inbox-এর AI — বর্তমান @QORIX3_bot পুনর্ব্যবহার

## লক্ষ্য ও অপরিবর্তিত অংশ
- ব্যক্তিগত Telegram account-এ কাস্টমারের DM এলে Telegram Business Connection দিয়ে **বর্তমান @QORIX3_bot** গ্রহণ করবে এবং যাচাইকৃত তথ্য থেকে AI উত্তর দেবে। নতুন bot, user-account login automation বা নতুন Support Ticket System নয়।
- বর্তমান Support Ticket, shop bot, website, reseller API, supplier sync, stock alerts, payment, wallet ও delivery অপরিবর্তিত থাকবে। এই AI কোনো purchase, debit, refund বা delivery চালাবে না।
- এটি অনুমোদনের জন্য পরিকল্পনা; এখন কোনো কোড, live webhook, সংযোগ বা customer reply বদলানো হয়নি।

## যাচাইয়ের ফল
| বিষয় | বর্তমান অবস্থা |
|---|---|
| Telegram Business API | একই বট দিয়ে সংযুক্ত account-এর নির্বাচিত private chats পরিচালনার পদ্ধতি আছে। |
| বর্তমান বট | Webhook ও Telegram sender আছে; কিন্তু Business update dispatcher, connection storage বা AI reply নেই। |
| Webhook subscription | `TELEGRAM_UPDATES` এখন শুধু `message`, `edited_message`, `callback_query`, `my_chat_member`; স্বয়ংক্রিয় registration-ও এই তালিকা ব্যবহার করে। |
| তথ্যের উৎস | নিরাপদ `public_products` projection, product description/note/guide/details ও stock counters আছে; order ownership যাচাইয়ের utility আছে। আলাদা authoritative warranty source প্রতিষ্ঠিত হয়নি। |
| সার্ভার | TanStack Start/Cloudflare Worker ও Supabase clients আছে; persistent storage ও scheduled recovery pattern আছে। |
| Live readiness | এখানে Telegram credential বা accessible Telegram connector নেই; `getMe`, live webhook ও Business connection যাচাই করা যায়নি। AI server key উপস্থিত, কিন্তু validity/availability পরীক্ষা হয়নি। |
| Backend ownership | বর্তমান preview auth `external_unmanaged`; repository configuration দিয়ে Lovable Cloud বনাম ব্যক্তিগত Supabase-এর মালিকানা বা deployed settings নিশ্চিত করা যায় না। বিদ্যমান backend সরানো হবে না। |

**Compatibility gate:** BotFather-এ Business Mode এবং `getMe.can_connect_to_business` যাচাই করতে হবে। ব্যক্তিগত account-এর Telegram Business সুবিধা, connect করার সুযোগ, নির্বাচিত chats, active connection এবং granted rights বাস্তবে যাচাই না হওয়া পর্যন্ত auto-reply চালু হবে না। Telegram account-এর login code/2FA চাইতে হবে না; সংযোগ আপনি Telegram app থেকে করবেন।

## কী তৈরি হবে
### ১. একই বটে আলাদা Business মেসেজ পথ
- বিদ্যমান webhook URL ও secret রেখে চারটি update যোগ: `business_connection`, `business_message`, `edited_business_message`, `deleted_business_messages`। পুরোনো subscription এবং প্রয়োজনীয় অন্য live subscriptions সংরক্ষণ হবে।
- স্বয়ংক্রিয় webhook registration-ও একই merged তালিকা ব্যবহার করবে; preview যেন live bot-এর webhook দখল না করে। `getUpdates`, webhook deletion বা pending-update deletion ব্যবহার করা হবে না।
- Business updates সাধারণ shop dispatcher-এ যাবে না; `/start`, checkout, support ticket ও shop session অক্ষত থাকবে।
- শুধু অনুমোদিত account-এর active connection ও অনুমতিপ্রাপ্ত private chat গ্রহণ হবে; প্রথম connection-কে নিজে থেকে trusted করা হবে না।
- নিজের outgoing message, `sender_business_bot` ও bot-authored reply বাদ দিয়ে loop বন্ধ হবে। Owner-এর নিজের reply নির্ভরযোগ্যভাবে শনাক্ত হলে chat-এ AI pause হবে; এর বাস্তব আচরণ pilot-এ যাচাই হবে।

### ২. নির্ভরযোগ্য সংরক্ষণ ও উত্তর পাঠানো
- আলাদা Business connection, chat, message, job ও audit records থাকবে—**ticket records নয়**। Scope হবে connection ID + chat ID।
- Validated update durable storage-এ রেখে acknowledgment; দীর্ঘ AI call webhook আটকে রাখবে না। Storage ব্যর্থ হলে retryable response।
- Update/message deduplication, chat-ভিত্তিক serial job claims, generation/version checks এবং recovery থাকবে। Edit-এ pending উত্তর invalidate হবে; deletion-এর content AI context থেকে বাদ যাবে।
- উত্তর তৈরি ও send-এর ঠিক আগে active connection, chat AI flag, takeover/version এবং `can_reply` পুনরায় যাচাই হবে। Telegram-এর নিয়ম: গত **২৪ ঘণ্টায় incoming message থাকা private chat**-এ reply permission প্রযোজ্য।
- একই chat-এ `business_connection_id` সহ send; bot DM fallback নয়। Unknown delivery outcome-এ resend না করে handover; exactly-once guarantee নেই।

### ৩. বর্তমান তথ্য থেকে AI উত্তর
- Product search, বর্তমান stock/retail price, description, important note, quick guide ও অনুমোদিত documentation server-side read-only tools থেকে আসবে। Stock-এর জন্য বর্তমান counter ব্যবস্থাই থাকবে; supplier কেনাকাটার API ডাকবে না।
- Reseller pricing কেবল যাচাইকৃত reseller পরিচয়ে; সবার জন্য reseller rate প্রকাশ নয়। Sale/order price প্রয়োজন হলে saved order price ব্যবহার হবে।
- Warranty লেখা থাকলে সেটিই উদ্ধৃত হবে; সাধারণ promotional warranty copy থেকে সব পণ্যে replacement promise তৈরি করা হবে না। তথ্য না থাকলে human handover।
- Order number, email বা screenshot একা ownership proof নয়। Telegram-origin orders-এ verified sender/order binding; website/reseller order-এ existing authenticated proof বা নিরাপদ signed order access লাগবে।
- AI context থেকে password, delivered account credentials, raw order meta, supplier cost/identity/endpoint/key ও অন্য কাস্টমারের তথ্য বাদ থাকবে। Order status জানতে authentication link ব্যবহার করা যাবে; তার secret/token AI prompt-এ যাবে না।
- Customer messages ও product documents নির্দেশ নয়, untrusted content হিসেবে বিবেচিত হবে। AI-এর tools হবে সীমিত read-only; তথ্য না পেলে অনুমান নয়।
- প্রথম ধাপে text ও text caption; voice/image attachment বিশ্লেষণ না করে মানুষের কাছে যাবে। কাস্টমারের ভাষায় সংক্ষিপ্ত উত্তর; Telegram text limit **৪০৯৬ characters after entity parsing** মেনে escaped/plain text। বর্তমান rich-table বা premium-emoji sender বদলানো হবে না।

### ৪. Human Takeover ও Per-Chat AI On/Off
- পৃথক **Business Inbox AI** admin section: connection status, global switch, chat list, message history, AI/Human/Paused অবস্থা, AI On/Off, Take Over, Resume ও নিরাপদ error status। বর্তমান Support page থাকবে যেমন আছে।
- Global auto-reply default OFF; প্রথমে নির্বাচিত test chat-এ ON। এক chat-এর switch অন্য chat বা shop bot-কে প্রভাবিত করবে না।
- Take Over করলে pending reply cancel হবে; চলমান generation stop করার সংকেত ও send-time guard থাকবে। ইতিমধ্যে Telegram-এ গৃহীত reply ফিরিয়ে নেওয়া যাবে এমন প্রতিশ্রুতি নয়।
- Refund, payment dispute, account ownership/security, অনিশ্চিত উত্তর বা backend/provider failure-এ handover; admin Resume না করা পর্যন্ত AI বন্ধ।
- Telegram app-এর pause মানতে হবে; dedicated per-chat pause Bot API আছে ধরে নেওয়া হবে না।
- Admin action audit, chat retention/cleanup ও অন্য account-এর data access নিষিদ্ধ থাকবে।

## প্রযুক্তিগত বাস্তবায়ন
- নতুন server-only `src/lib/business-inbox/` modules: update validation/routing, policy, data reads, durable jobs, AI generation ও Business sender। পুরোনো `engine.server.ts`-এ Business message পুনর্ব্যবহার নয়।
- Integration points: `src/routes/api/public/telegram/webhook.ts`, `src/lib/bot/contact.ts`, `src/lib/bot/ensure-webhook.server.ts` এবং Telegram transport। Business sends যেন সাধারণ bot reachability/member/broadcast ledger-এ customer যোগ না করে, সেই side-effect আলাদা থাকবে।
- AI: Lovable AI Gateway, নতুন default `openai/gpt-6-astra`, Vercel AI SDK Responses streaming server-side; final উত্তরই Telegram-এ যাবে। Request-local gateway run ID, `store:false`, supported reasoning এবং bounded read-only tools থাকবে; secrets browser-এ নয়। AI usage workspace credits থেকে কাটবে।
- Durable background execution: persist করার পরে bounded independent processing; বর্তমান notify/scheduled tick-এ কেবল ছোট recovery trigger। AI generation existing stock-alert lease/recipient queue দখল করবে না; runtime capacity ও published execution pilot-এ যাচাই হবে।
- RLS enabled থাকবে। Business records-এর public access নেই; admin controls-এ verified admin role; webhook/worker privileged writes কেবল validated caller/connection-এর পরে। বর্তমান schema/grants live যাচাই করে additive migrations; backend migration নয়।
- Admin route-এ নিজস্ব metadata/shared theme; support schema/UI/API untouched।
- Gateway denial/refusal-এ stop, নিরাপদ কারণ admin-এ; credit/policy block-এ persistent global pause, blind retry নয়। Transient 429/5xx-এ bounded backoff; account/model failure-এ নতুন probe বা model substitution নয়।

## পরীক্ষা, চালু করা ও rollback
১. Read-only live checks: bot identity/capability, current webhook/allowed updates, backend schema/grants, execution mechanism ও AI availability। অমিল থাকলে implementation থামিয়ে কারণ জানানো।
২. Focused tests: চারটি Business update, unauthorized connection, wrong recipient, duplicate/edit/delete, owner/bot loops, ২৪ ঘণ্টার boundary, per-chat pause, takeover race, current pricing, order ownership ও secrets exclusion। Existing shop/wallet/payment/delivery/ticket regressions চালানো।
৩. সব OFF রেখে deploy; একই বট ব্যক্তিগত account-এ আপনি connect করবেন। একটি অনুমোদিত test customer chat-এ incoming message → live product reply → personal account identity → admin history readback পরীক্ষা। Human reply/pause/resume এবং connection revoke-ও যাচাই।
৪. Existing bot `/start`, product browse ও support ticket flow পরীক্ষা; বাস্তব paid order আলাদা অনুমোদন ছাড়া নয়। তারপর আপনার অনুমতিতে নির্বাচিত customer chats-এ ON। সব inbox বা ঐতিহাসিক chat access দাবি নয়—শুধু Telegram-এ দেওয়া scope।
৫. Rollback: global OFF ও pending AI jobs cancel; প্রয়োজনে Telegram Business connection বন্ধ। সাধারণ bot webhook, shop, tickets ও payment চালু থাকবে।

## বাস্তব যাচাই বাকি
- @QORIX3_bot-এর Business capability, আপনার account eligibility, granted rights এবং actual connection/update delivery।
- Deployed backend/schema/secrets ও AI request success; authenticated admin controls বর্তমানে এখানে যাচাই করা যায়নি।
- Product-specific warranty/documentation কোথায় authoritative—বিদ্যমান লেখা আগে পর্যালোচনা; অনুপস্থিত policy বানানো নয়।

## সরকারি সূত্র
- [Business bots](https://core.telegram.org/bots/features#connected-business-bots)
- [BusinessConnection](https://core.telegram.org/bots/api#businessconnection), [BusinessBotRights](https://core.telegram.org/bots/api#businessbotrights)
- [Update](https://core.telegram.org/bots/api#update), [Message](https://core.telegram.org/bots/api#message)
- [getMe](https://core.telegram.org/bots/api#getme), [sendMessage](https://core.telegram.org/bots/api#sendmessage)
- [setWebhook](https://core.telegram.org/bots/api#setwebhook), [Telegram Business](https://telegram.org/blog/telegram-business)