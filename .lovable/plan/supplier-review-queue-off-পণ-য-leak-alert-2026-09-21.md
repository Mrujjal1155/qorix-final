# Supplier Review Queue + Off-পণ্য Leak Alert

দুইটি অংশ। কোনো চালু পণ্য বন্ধ হবে না, বিদ্যমান ফিচার অপরিবর্তিত থাকবে।

## ১) নতুন/ID-বদলানো পণ্যের Admin Review Queue

**যা হবে**
- Supplier sync-এ যখন কোনো একদম নতুন item আসে, বা পুরোনো কোনো পণ্যের supplier ID বদলে যায় — সেটি সরাসরি catalogue-এ না গিয়ে "Review" তালিকায় জমা হবে (quarantine)।
- Quarantine অবস্থায় পণ্য বট/ওয়েবসাইট/reseller API কোথাও দেখাবে না।
- Admin → Suppliers পেজে নতুন "Review Queue" ট্যাব: supplier নাম, পণ্যের নাম, দাম, stock, কারণ (নতুন / ID বদল), তারিখ।
- প্রতিটিতে Approve / Reject বাটন, সাথে checkbox দিয়ে **একসঙ্গে সব approve বা reject**।
- Approve = পণ্য live হবে (চাইলে category বাছাই করে)। Reject = স্থায়ীভাবে লুকানো, পরের sync-এ আর ফিরে আসবে না।
- Admin sidebar/hub-এ pending সংখ্যার badge।

**কারণ**
এখন নতুন item বন্ধ অবস্থায় তৈরি হয় ঠিকই, কিন্তু সেগুলো ১,০০০+ পণ্যের তালিকায় মিশে যায়, খুঁজে পাওয়া কষ্ট। আলাদা queue হলে প্রতিটি নতুন পণ্য চোখে পড়বে এবং ইচ্ছাকৃতভাবেই live হবে।

## ২) Off থাকা পণ্য কোথাও দেখা গেলে সঙ্গে সঙ্গে Alert

**যা হবে**
- বট, ওয়েবসাইট ও reseller API — এই তিন জায়গায় পণ্য দেখানোর ঠিক আগে একটি পাহারা যোগ হবে: কোনো Off পণ্য তালিকায় ঢুকে পড়লে সেটি তখনই বাদ যাবে (গ্রাহক দেখবে না)।
- একই সাথে ঘটনাটি রেকর্ড হবে এবং Admin Dashboard-এ লাল alert দেখাবে (কোন পণ্য, কোথায়, কখন)।
- Telegram admin/group-এ একটি notification যাবে, একই পণ্যের জন্য ঘণ্টায় একবার (spam ঠেকাতে)।
- Settings-এ on/off সুইচ থাকবে।

## প্রযুক্তিগত বিবরণ

- নতুন টেবিল `supplier_review_queue` (supplier_id, external_id, product_id, reason: `new`/`rotated`, snapshot jsonb, status: `pending`/`approved`/`rejected`, timestamps) + GRANT + RLS (শুধু admin)।
- নতুন টেবিল `visibility_alerts` (product_id, surface: `bot`/`web`/`api`, detail, created_at) + GRANT + RLS (শুধু admin)।
- `src/lib/suppliers/sync.server.ts`: নতুন product তৈরি ও `relinkRotatedIds` — দুই জায়গায় queue row ইনসার্ট; rejected external_id হলে product তৈরি করবে না।
- `src/lib/admin.functions.ts`: `listReviewQueue`, `decideReviewItems` (bulk approve/reject), `listVisibilityAlerts`, `dismissVisibilityAlert`।
- `src/routes/admin/suppliers.tsx`: Review Queue ট্যাব; `src/routes/admin/index.tsx`: alert কার্ড + badge।
- Guard helper `src/lib/suppliers/visibility-guard.server.ts`, ব্যবহার হবে `bot/engine.server.ts`, `shop.functions.ts`, `reseller/core.server.ts` + `reseller/webhook.server.ts`-এ; Telegram notification বিদ্যমান alert queue দিয়েই যাবে।
- বিদ্যমান ১২০টি On পণ্য ও ১৯টি Off পণ্যের অবস্থা অপরিবর্তিত থাকবে।
