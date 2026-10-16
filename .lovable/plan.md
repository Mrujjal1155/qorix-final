# সরবরাহকারীর পরিচয় সুরক্ষা ও নিরাপত্তা শক্ত করা

## বিস্তারিত যাচাইয়ের ফল
- সরাসরি anonymous পরীক্ষায় মূল products/suppliers-এর ব্যক্তিগত তথ্য এবং server-only projection পড়া আটকে গেছে; ৪টি পরীক্ষা পাস। RLS সব application table-এ চালু এবং গুরুত্বপূর্ণ balance/stock RPC সাধারণ account থেকে চালানো নিষিদ্ধ।
- qorixlab.com-এর রিসেলার products, orders, transactions ও account endpoint লগইন ছাড়া 401 দিয়েছে। প্রথম পাতায় লোড হওয়া ৫৩টি JavaScript resource-এ খোঁজা supplier পরিচয় পাওয়া যায়নি; পরীক্ষিত map-এ মূল কোডের কপি মেলেনি। এটি সব সম্ভাব্য bundle বা সব পরিচয়ের নিশ্চয়তা নয়।
- **নিশ্চিত পরিচয় প্রকাশের পথ:** স্বয়ংক্রিয় supplier announcement টেলিগ্রামের ঘোষণায় supplier-এর নাম এবং বাইরের লেখা সরাসরি যোগ করে। সাধারণ stock alert-এর durable delivery ব্যবস্থা থেকে এটি আলাদা।
- **নিশ্চিত প্রকাশ্য বক্তব্য:** website order-এর একটি error-এ “Supplier is temporarily unavailable” আছে। Reseller API-তে একটি error code-ও `supplier_unavailable`।
- **ভবিষ্যৎ পরিচয় ফাঁসের পথ:** supplier sync নতুন পণ্যে remote image URL বসাতে পারে; image endpoint সেই URL-এ redirect করে। বর্তমানে সক্রিয় পণ্যে নিজের storage-এর বাইরের remote image পাওয়া যায়নি; এখনই supplier image প্রকাশ হচ্ছে এমন প্রমাণ নেই।
- পণ্যের সাধারণ লেখা এবং delivery account-এর তথ্য সরাসরি আসে। দুটি পণ্যে MailReader লেখা আছে, কিন্তু একটি নিজস্ব mail-reader সেবাও রয়েছে; তাই শব্দ দেখে একে supplier identity বলে মুছে ফেলা ঠিক নয়।
- **নিরাপত্তাঝুঁকি:** reseller webhook URL শুধু HTTPS যাচাই করে; private/internal ঠিকানা ও redirect আটকায় না। এটি অনুচিত server-side request-এর সুযোগ; ভিতরের network বা secret সত্যিই পড়া গেছে এমন পরীক্ষা করা হয়নি।
- **শর্তসাপেক্ষ ঝুঁকি:** আলাদা Binance auto-verify endpoint-এ secret না থাকলে authorization বাদ পড়ে। Sandbox-এ ওই আলাদা secret অনুপস্থিত; live endpoint ইচ্ছাকৃতভাবে চালানো হয়নি, যাতে payment processing শুরু না হয়।
- Database linter-এ সমস্যা নেই; automated scan পূর্ণ application audit নয় এবং infrastructure scan সংযোগ না থাকায় বাদ গেছে। বর্তমান external Supabase-এ signed-in user/reseller হিসেবে end-to-end পরীক্ষা করা যায়নি।

## অনুমোদনের পর পরিবর্তন
1. বাইরের ঘোষণায় supplier-এর নাম, title ও body সরাসরি প্রকাশ বন্ধ; সেগুলো admin-এর ব্যক্তিগত পর্যালোচনায় থাকবে। সাধারণ stock/price/new-product notification-এর durable queue অপরিবর্তিত থাকবে।
2. customer/reseller-facing sourcing বক্তব্য ও internal error সরিয়ে নিরপেক্ষ QORIX product/delivery বার্তা দেব। Admin-এর supplier পরিচয় ও diagnostic তথ্য ব্যক্তিগত থাকবে।
3. website, SEO, reseller API/webhook ও bot-এ পণ্যের ছবি নিজের ঠিকানা দিয়ে পরিবেশন করব; remote URL browser-এ বা redirect header-এ যাবে না। কেবল অনুমোদিত image origin, নিরাপদ content type, download size ও timeout দিয়ে server-side fetch; reseller-এর private product-এর ছবিও প্রকাশ্য হবে না। নতুন ছবিতে সম্ভব হলে নিজের storage-এ import করব।
4. name/description/guide/details-এর public projection-এ নিশ্চিত supplier নাম, domain, contact ও internal field বাদ দেব। নিজের mail-reader বা product-এর প্রয়োজনীয় login URL অন্ধভাবে মুছব না; সন্দেহজনক লেখা admin review-তে রাখব। অপ্রমাণিত manufacturer/ownership দাবি যোগ করব না।
5. reseller webhook-এর private/local/IP-literal ঠিকানা, embedded credentials ও redirect নিষিদ্ধ করব; save ও send—দুই জায়গায় একই যাচাই হবে। Runtime-এর উপযোগী public-destination যাচাই ব্যবহার করব; শুধু string check দিয়ে DNS rebinding নিরাপদ বলে দাবি করব না।
6. Binance auto-verify বর্তমান authenticated scheduler-এর মতো fail-closed হবে। অনুমতি ছাড়া কেউ verification চালাতে পারবে না; বর্তমান schedule ও payment verification-এর নিয়ম অক্ষত থাকবে। Order-file signing-এর পরিচিত fallback বাদ দিয়ে secret না থাকলে download বন্ধ হবে।
7. বর্তমান order SELECT-এ customer পুরো meta পড়তে পারে; ভবিষ্যৎ internal supplier error সেখানে থাকলে ফাঁস হতে পারে। ব্যক্তিগত diagnostic সাধারণ customer-এর direct read থেকে আলাদা করে safe order response রাখব; order history, payment/refund display ও admin troubleshooting সচল রাখব।
8. Reseller API docs-এ visible field/error আচরণের পরিবর্তন লিখব; stock/custom-price/order delivery business rule বদলাব না।

## পরীক্ষা ও সীমা
- supplier privacy, public image/response allowlist, webhook destination, cron denial এবং signing fail-closed-এর focused test যোগ ও চালানো হবে। দোকান/product/SEO এবং unauthenticated denial আবার পরীক্ষা করব।
- বাস্তব purchase, payment, refund, stock upload, customer message বা webhook dispatch পরীক্ষা অনুমতি ছাড়া করা হবে না; RLS কখনো বন্ধ নয়।
- পুরোনো live code-এ সুরক্ষা পৌঁছাতে নতুন প্রকাশ দরকার; প্রকাশের জন্য আলাদা অনুমতি লাগবে। Signed-in account পরীক্ষা অনুপলব্ধ থাকলে স্পষ্টভাবে জানাব।
- delivery credential-এর প্রয়োজনীয় URL, product branding, বাইরের সাইট, আগের screenshot বা আগে সংগ্রহ করা তথ্য থেকে পরিচয় অনুমান সম্পূর্ণ আটকানো যায় না। Server-এর ব্যক্তিগত integration logic সরিয়ে ফেললে সরবরাহ বন্ধ হবে; লক্ষ্য সেটি অননুমোদিতভাবে পড়া আটকানো, সব trace মুছে ফেলার প্রতিশ্রুতি নয়।

## কারিগরি অংশ
- Shared server-only public product projection ও content policy; explicit allowlist এবং same-origin image endpoint।
- Shared outbound destination policy, redirect disabled, runtime-compatible checks; bounded image/webhook fetch।
- Database পরিবর্তন প্রয়োজন হলে migration tool-এর মাধ্যমে grants/RLS বজায় রেখে safe customer order access ও private diagnostics আলাদা করা।
- Authorization এবং security rule-এর concrete regression tests; AGENTS.md-এ structural rules, roadmap-এ remaining deployment/account blockers।