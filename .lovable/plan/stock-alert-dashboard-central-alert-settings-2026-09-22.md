# Stock Alert Dashboard + Central Alert Settings

## ১. Alert Health Dashboard (শুধু admin)

নতুন পেজ: **Admin → Alerts** (সাইডবারে "Alert health")।

দেখা যাবে:
- **Delivery rate** — মোট alert-এর কতগুলো সফলভাবে গেছে (delivered / total, %)।
- **Failure ও retry** — failed সংখ্যা, retry-তে আটকে থাকা সংখ্যা, মোট retry attempts, সর্বশেষ error।
- **Latency** — তৈরি হওয়া থেকে পাঠানো পর্যন্ত গড় ও সর্বোচ্চ সময় (সেকেন্ড)।
- **উৎস অনুযায়ী ভাগ** — supplier sync, in-house বিক্রি, admin action, reseller — প্রত্যেকটির delivery rate ও ব্যর্থতা।
- **ধরন অনুযায়ী ভাগ** — restock / low / out / new / price।
- **Trend** — শেষ ১৪ দিনের দৈনিক পাঠানো বনাম ব্যর্থ (সরল bar chart)।
- **সাম্প্রতিক ব্যর্থ alert তালিকা** — পণ্যের নাম, ধরন, চেষ্টার সংখ্যা, error, এবং প্রতি সারিতে **Retry** বোতাম।
- সময়সীমা বাছাই: ২৪ ঘণ্টা / ৭ দিন / ৩০ দিন।

ডেটা শুধু `stock_notification_events` টেবিল থেকে পড়া হবে — নতুন টেবিল লাগবে না, কোনো alert পাঠানোর নিয়ম বদলাবে না।

## ২. Central alert configuration (Settings → Stock alerts)

Settings hub-এ নতুন একটি কার্ড, যেখানে সব alert নিয়ন্ত্রণ এক জায়গায়:
- **Low stock threshold** — কত ইউনিটে নামলে "almost gone" alert যাবে (বর্তমান `announce_low_threshold`)।
- **Restock alert** চালু/বন্ধ, **Low/Out alert** চালু/বন্ধ, **Price alert** ও price-up আলাদা toggle, **New product alert** toggle।
- **Bot DM copies** toggle — group ছাড়াও সব bot user-কে DM যাবে কি না।
- **Default recipient** — মূল channel/group ID।
- **Supplier অনুযায়ী recipient** — প্রতিটি supplier-এর জন্য আলাদা channel/group ID দেওয়া যাবে; ফাঁকা রাখলে default-এ যাবে। In-house পণ্যের জন্যও একটি আলাদা ঘর থাকবে।

সব মান বিদ্যমান নিরাপদ settings টেবিলেই থাকবে এবং শুধু admin সংরক্ষণ করতে পারবে।

## ৩. Technical details

- `src/lib/alerts.functions.ts`: `getStockAlertStats` ও `retryStockAlert` — `requireSupabaseAuth` + `has_role(admin)` যাচাই, aggregation server-side।
- `retryStockAlert` বিদ্যমান `stock_notification_events` সারিকে `pending`-এ ফেরত দেবে (service-role RPC ব্যবহার করে), নতুন event বানাবে না — তাই duplicate যাবে না।
- নতুন রুট `src/routes/admin/alerts.tsx`, `AdminShell` + `AdminPanel` প্যাটার্নে, mobile-responsive; `AdminShell` nav-এ একটি আইটেম যোগ।
- Settings কার্ড `SettingsHub`-এ নতুন section; keys: `announce_low_threshold`, `announce_restock`, `announce_low`, `announce_price`, `announce_price_up`, `announce_new`, `announce_dm`, `announce_chat_id`, এবং নতুন `announce_chat_supplier:<supplier_id>` / `announce_chat_inhouse`।
- Sender (`engine.server.ts`) recipient বাছার সময় আগে supplier-ভিত্তিক key দেখবে, না পেলে default `announce_chat_id` — অন্য কোনো আচরণ বদলাবে না।
- কোনো database migration লাগবে না; `bunx tsgo --noEmit` দিয়ে যাচাই।
