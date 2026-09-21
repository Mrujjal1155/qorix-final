# রেফারেল সিস্টেম — পেশাদার ও নিরাপদ করা

আপনি যে ৭টি দুর্বলতা ধরেছেন, সবগুলোই ঠিক। নিচে প্রতিটির সমাধান।

## কী বদলাবে

**১. অর্ডার বাতিল/রিফান্ড হলে কমিশন ফেরত (clawback)**
বট ও ওয়েবসাইট — দুই জায়গাতেই। অর্ডার cancelled/refunded হলে ওই অর্ডারে দেওয়া কমিশন referrer-এর ওয়ালেট থেকে স্বয়ংক্রিয়ভাবে কেটে নেওয়া হবে, আয়ের হিসাবও কমবে, এবং referrer-এর লেনদেন তালিকায় "Referral reversed" লেখা একটি এন্ট্রি বসবে। ব্যালান্স কম থাকলে ঋণাত্মক না করে যতটুকু আছে ততটুকু কেটে বাকিটা বকেয়া হিসেবে রেকর্ড থাকবে।

**২. এক অর্ডারে দুইবার কমিশন নয়**
নতুন একটি কমিশন-খাতা (ledger) হবে, প্রতি অর্ডারে একটিই সারি — তাই বটেও ওয়েবসাইটের মতো ডুপ্লিকেট আটকাবে (payment retry হলেও দ্বিতীয়বার কমিশন যাবে না)।

**৩. ব্যান করা referrer কমিশন পাবে না**
বট: `is_banned` চেক। ওয়েবসাইট: profiles-এ ব্যান ফ্ল্যাগ যোগ হবে এবং সেটি চেক হবে। ব্যান থাকলে কমিশন skip হবে এবং খাতায় কারণসহ রেকর্ড থাকবে।

**৪. ন্যূনতম অর্ডার ও সর্বোচ্চ কমিশন — দুই চ্যানেলেই**
এখন শুধু ওয়েবসাইটে আছে; একই নিয়ম বটে যোগ হবে।

**৫. সেটিংস একীভূত**
percent / min order / max commission / on-off — একটি জায়গা থেকে দুই চ্যানেলেই প্রযোজ্য হবে (Admin → Settings)। চাইলে চ্যানেলভিত্তিক আলাদা percent রাখার সুইচও থাকবে, কিন্তু ডিফল্ট একই। ফলে একই মানুষ দুই জায়গায় দুই হারে আয় করতে পারবে না।

**৬. একই মানুষ = একই অ্যাকাউন্ট**
ওয়েবসাইট প্রোফাইলের সঙ্গে Telegram অ্যাকাউন্ট লিংক করার ব্যবস্থা (বট থেকে কোড নিয়ে ওয়েবসাইটে যুক্ত)। লিংক থাকলে দুই চ্যানেলের রেফারেল আয় একটিই হিসাবে দেখাবে এবং একই ব্যক্তিকে দুই দিক থেকে ডাবল কমিশন দেওয়া বন্ধ হবে (self-referral ক্রস-চ্যানেলেও আটকাবে)।

**৭. Credit store আলাদা টেবিলে**
এখন credit-এর হিসাব ইউজার state-এর ভেতরে JSON-এ — ভঙ্গুর। আলাদা দুটি টেবিল হবে: ক্রেডিট ব্যালান্স ও ক্রেডিট ইভেন্ট (কে, কবে, কোন বন্ধুর জন্য, কত)। পুরোনো JSON ডেটা মাইগ্রেশনে নতুন টেবিলে তুলে নেওয়া হবে — কারও ক্রেডিট হারাবে না।

**৮. Daily cap পার হলে ক্রেডিট আর হারাবে না**
ক্যাপ পার হলে ইভেন্টটি `pending` অবস্থায় থাকবে এবং পরদিন ক্যাপের ভেতরে স্বয়ংক্রিয়ভাবে যোগ হবে (বন্ধুর ক্রেডিট স্থায়ীভাবে বাদ যাবে না)।

## টেকনিক্যাল অংশ

- নতুন টেবিল `referral_commissions`: order_id (unique), channel, referrer (user_id/telegram_id), buyer, percent, amount, status (credited / reversed / skipped), reason, timestamps। admin-only RLS + service_role grant।
- নতুন টেবিল `referral_credits` (telegram_id PK, earned, spent) ও `referral_credit_events` (inviter, invitee, credits, status pending/awarded, awarded_on)। পুরোনো `bot_users.state->refstore` থেকে এককালীন ব্যাকফিল।
- `profiles`-এ `is_banned boolean default false`, `telegram_id bigint unique`।
- DB ফাংশন `referral_award(...)` ও `referral_reverse(order_id)` — SECURITY DEFINER, atomic; ব্যালান্স ও earnings একসাথে আপডেট করে ledger + wallet_transactions/transactions লেখে।
- `credit_website_referral()` ট্রিগার নতুন ফাংশনে রিরাইট (unified settings key, ban check, ledger)। `orders` status cancelled/refunded হলে reverse ট্রিগার।
- `engine.server.ts`: চেকআউটের ইনলাইন কমিশন ব্লক `referral_award` কলে বদলাবে; refstore হেল্পারগুলো নতুন টেবিল ব্যবহার করবে; cap পার হলে pending event।
- `admin.functions.ts`: `setOrderStatus` ও `refundOrderToWallet`-এ reverse কল।
- Settings UI-তে unified key (`referral_percent`, `referral_min_order`, `referral_max_commission`, `referral_enabled`) — পুরোনো `web_referral_*` মান একবার কপি হবে যাতে কিছু না ভাঙে।

## যা বদলাবে না

বর্তমান On/Off পণ্য, দাম, supplier sync, bot UI রঙ/লেখা, reseller API ফরম্যাট — কিছুই না।
