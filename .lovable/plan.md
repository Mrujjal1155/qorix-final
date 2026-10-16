# সরবরাহকারীর API চাবি ও balance সুরক্ষা

## স্পষ্ট পরিধি
- Product description, details, image ও সাধারণ product data হুবহু থাকবে; এগুলো আড়াল, rewrite, sanitize বা proxy করা হবে না।
- এই কাজ শুধু supplier API key, private integration endpoint, ব্যক্তিগত diagnostic এবং unauthorized supplier purchase-এর পথ যাচাই ও বন্ধ করার জন্য।
- API ঠিকানা জানলেই সাধারণত কেনাকাটা করা যায় না; বৈধ credential বা authorization bypass লাগবে। কোনো supplier-এর নিজস্ব প্রকাশ্য API ঠিকানা ইন্টারনেট থেকে মুছে ফেলা সম্ভব নয়; আমাদের উত্তর/কোড থেকে private connection তথ্য ফাঁস এবং অনুমতি ছাড়া ব্যবহার আটকানোই লক্ষ্য।

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
1. supplier credentials, base URL, purchase endpoint, raw supplier response/error ও server-only integration code যেন public website/API/webhook/browser bundle বা সাধারণ account-এর direct database read দিয়ে না পাওয়া যায়—এই সীমা পরীক্ষা ও শক্ত করব। Product description/details/image অপরিবর্তিত থাকবে।
2. private supplier diagnostics order meta-তে থাকলে customer-এর direct read থেকে সেগুলো পৃথক করব; public order response-এ শুধু প্রয়োজনীয় payment/delivery/refund তথ্য থাকবে। Admin troubleshooting এবং order history সচল থাকবে। Credential বা private endpoint প্রকাশ করে এমন error-ই সংশোধন করব; সাধারণ product content বদলাব না।
3. reseller webhook-এর private/local/IP-literal ঠিকানা, embedded credentials ও redirect নিষিদ্ধ করব; save ও send—দুই জায়গায় একই যাচাই হবে। Runtime-এর উপযোগী public-destination যাচাই ব্যবহার করব; শুধু string check দিয়ে DNS rebinding নিরাপদ বলে দাবি করব না। এতে server-কে অনুচিত ঠিকানায় request পাঠাতে ব্যবহার করার সুযোগ কমবে।
4. supplier purchase/retry/admin action-এ server-side authorization, reseller ownership, balance debit, duplicate order ও payment verification-এর সীমা পরীক্ষা করব। শুধু নিশ্চিত ত্রুটি থাকলে সংশোধন; বাস্তব supplier order তৈরি করে পরীক্ষা নয়। অননুমোদিত Binance auto-verify trigger বর্তমান scheduler-এর মতো fail-closed করব, schedule অক্ষত রেখে।
5. supplier webhook-এর ভুল secret/unknown integration উত্তরে একই generic denial দেব। Reseller API docs-এ সংশ্লিষ্ট security/error পরিবর্তন লিখব; stock/custom-price/order delivery business rule বদলাব না।

## পরীক্ষা ও সীমা
- supplier credential/endpoint privacy, private response allowlist, webhook destination, cron denial এবং unauthorized purchase/retry-এর focused test যোগ ও চালানো হবে। দোকান/product/SEO এবং unauthenticated denial আবার পরীক্ষা করব। Product content/image অক্ষত আছে যাচাই করব।
- বাস্তব purchase, payment, refund, stock upload, customer message বা webhook dispatch পরীক্ষা অনুমতি ছাড়া করা হবে না; RLS কখনো বন্ধ নয়।
- পুরোনো live code-এ সুরক্ষা পৌঁছাতে নতুন প্রকাশ দরকার; প্রকাশের জন্য আলাদা অনুমতি লাগবে। Signed-in account পরীক্ষা অনুপলব্ধ থাকলে স্পষ্টভাবে জানাব।
- অপরিবর্তিত product data, প্রয়োজনীয় delivery URL, বাইরের সাইট বা আগেই সংগ্রহ করা তথ্য থেকে source অনুমান সম্পূর্ণ আটকানো যায় না; এটি supplier API key চুরি বা balance ব্যবহার করতে পারার প্রমাণ নয়। আর্থিক ক্ষতি কখনো হবে না—এমন নিশ্চয়তা নয়। Server-এর private integration logic কাজের জন্য থাকবে, কিন্তু অননুমোদিতভাবে পড়া বা ব্যবহার আটকাতে হবে।

## কারিগরি অংশ
- Server-only supplier connection logic ও explicit private-field exclusion; product content/image অপরিবর্তিত।
- Shared outbound webhook destination policy, redirect disabled, runtime-compatible checks; bounded fetch।
- Database পরিবর্তন প্রয়োজন হলে migration tool-এর মাধ্যমে grants/RLS বজায় রেখে safe customer order access ও private diagnostics আলাদা করা।
- Authorization এবং security rule-এর concrete regression tests; AGENTS.md-এ structural rules, roadmap-এ remaining deployment/account blockers।