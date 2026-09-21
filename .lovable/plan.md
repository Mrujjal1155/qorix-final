# স্থায়ী Stock Alert System

## লক্ষ্য
Supplier ও in-house—দুই ধরনের পণ্যের stock add, restock, low stock ও out-of-stock পরিবর্তন থেকে প্রতি বাস্তব ঘটনার জন্য মাত্র একটি Telegram group post এবং নির্ধারিত bot notification পাঠানো। একই sync, webhook, retry বা admin action থেকে duplicate তৈরি হবে না।

## যা বদলাবে
- সব stock notification-এর জন্য একটি স্থায়ী database event queue ও delivery ledger যোগ হবে; JSON settings queue আর মূল source থাকবে না।
- প্রতিটি event-এর deterministic unique key থাকবে। একই supplier transition, webhook/poll overlap, retry বা একই admin upload দ্বিতীয় event বানাতে পারবে না।
- Supplier webhook ও polling একই event writer ব্যবহার করবে। যেসব supplier push দিতে পারে তারা তাৎক্ষণিক; বাকিগুলো বর্তমান ১৫-সেকেন্ড polling-এ চলবে।
- Website Admin ও Bot Admin—দুই stock upload-ই একই queue ব্যবহার করবে। সরাসরি Telegram send path সরানো হবে।
- In-house বিক্রির পরে available stock হিসাব করে threshold প্রথমবার cross করলে একটি low alert এবং শূন্য হলে একটি out alert তৈরি হবে। একই low অবস্থায় পুনরাবৃত্ত message যাবে না।
- Stock আবার বাড়লে একটি restock alert যাবে এবং নতুন stock cycle শুরু হবে; supplier-এর প্রতিটি বাস্তব stock increase-ও একবার করে ধরা হবে।
- Off/unlisted/deleted product-এর pending public alert delivery-এর আগে বাতিল হবে।
- Telegram failure হলে bounded retry/backoff থাকবে। Group post ও bot-user fan-out-এর progress আলাদাভাবে সংরক্ষিত থাকবে, তাই মাঝপথে restart হলেও আগের সফল ধাপ পুনরায় পাঠাবে না।
- পুরোনো pending JSON queue নিরাপদে নতুন queue-তে migrate করে legacy path বন্ধ করা হবে; পুরোনো delivered history duplicate ঠেকাতে রাখা হবে।

## Alert rules
- **Stock add / restock:** stock সত্যিই বাড়লে প্রতি transition-এ একবার।
- **Low stock:** configured threshold-এর ওপর থেকে threshold বা নিচে প্রথম নামলে একবার।
- **Out of stock:** positive থেকে zero হলে একবার।
- **Re-add:** zero/low cycle-এর পরে stock বাড়লে নতুন restock event, তারপর ভবিষ্যৎ low/out আবার একবার করে সম্ভব।
- **Manual “send restock” button:** নতুন stock event তৈরি করবে না; একই latest event retry করবে, যাতে accidental duplicate না যায়।

## যাচাই
- একই supplier snapshot একসঙ্গে webhook ও poll দিয়ে চালিয়ে একটিই event তৈরি হওয়া পরীক্ষা।
- Supplier 0→N, N→N+X, above-threshold→low, low→lower, low→0 এবং 0→N transition পরীক্ষা।
- Website ও Bot Admin bulk upload এবং in-house order depletion পরীক্ষা।
- Telegram simulated failure/retry ও concurrent delivery claim পরীক্ষা।
- Build/type check এবং বর্তমান database queue/status audit করা।

## Technical details
- নতুন public tables-এ authenticated admin/service-role grants, RLS এবং admin-only policies থাকবে।
- Atomic SQL functions event claim, delivery progress এবং stock-cycle state নিয়ন্ত্রণ করবে; public/anon access থাকবে না।
- Existing Telegram card design, premium emoji, group setting ও user subscription behavior অপরিবর্তিত থাকবে।
- Telegram API idempotency key দেয় না; duplicate ঠেকাতে send-এর আগে recipient/stage reservation persist করা হবে। এতে crash boundary-তে একই message পুনরায় যাওয়ার বদলে সর্বোচ্চ একটি delivery অগ্রাধিকার পাবে।
