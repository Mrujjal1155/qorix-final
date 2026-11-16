# Supplier Buy Orders — স্টক এলে স্বয়ংক্রিয় কেনাকাটা

## এই অনুরোধে যা তৈরি হবে
- অ্যাডমিনে **Supplier Buy Orders** নামে আলাদা বিভাগ। এটি বিনামূল্যের অর্ডার নয়; সাপ্লায়ারের API wallet থেকে অর্থ কেটে অ্যাকাউন্ট কিনবে।
- যুক্ত সাপ্লায়ার বেছে তার পণ্য নির্বাচন, স্টক ও নিজের চাওয়া মোট পরিমাণ দিয়ে বাই অর্ডার রাখা। সাপ্লায়ার বন্ধ থাকলে নতুন কেনাকাটা হবে না।
- অর্ডার চালু করার আগে একবার স্পষ্ট অর্থ খরচের নিশ্চিতকরণ। চালু করার পর নির্ধারিত মোট পরিমাণের মধ্যে প্রতিটি কেনাকাটায় আর অনুমতি লাগবে না।
- দাম নিয়ে কোনো অতিরিক্ত সীমা বা কেনার আগে price/balance call থাকবে না; আপনার সাপ্লায়ারের সঙ্গে নির্ধারিত চুক্তি অনুযায়ী বর্তমান API-ই চার্জ করবে। ব্যালেন্স কম হলে পরিষ্কার ব্যর্থতার অবস্থা দেখাবে, নিশ্চিত না হয়ে আবার কিনবে না।
- মোট লক্ষ্য, ইতোমধ্যে পাওয়া, বাকি, সর্বশেষ পরীক্ষা, কেনার ইতিহাস এবং অপেক্ষমাণ/কেনা চলছে/সম্পূর্ণ/যাচাই দরকার/বন্ধ অবস্থা। Pause, Resume ও Cancel থাকবে; চলমান অনুরোধ বাতিল করলে ইতোমধ্যে কেনা পণ্য ফেরত দেওয়ার দাবি করা হবে না।
- সফল কেনার অ্যাকাউন্ট নিরাপদে সংরক্ষণ এবং অ্যাডমিনের জন্য প্রতি ব্যাচ ও একসঙ্গে TXT ডাউনলোড। দোকানের বিক্রির স্টকে স্বয়ংক্রিয় যোগ নয়; গ্রাহক অর্ডার/ব্যালেন্সে পরিবর্তন নয়। সাপ্লায়ারের নিজস্ব Telegram বটে ডেলিভারি আসবে কি না তাদের ব্যবস্থার ওপর নির্ভর করবে।

## পরিমাণের নিয়ম
- লক্ষ্য ৫০ ও স্টক ৫০ হলে **একটি ৫০-পিস purchase request**, ৫০টি আলাদা request নয়।
- আপনার স্পষ্ট উদাহরণ: স্টক ৩৫ হলে ৩০, ২৫ হলে ২০, ১৫ হলে ১৫ কিনবে।
- সাধারণ নিয়ম: বাকি পুরো পরিমাণ পাওয়া গেলে সেটিই কিনবে; না পেলে ২০ বা বেশি স্টক থেকে নিচের দশকের পূর্ণ সংখ্যা, ৫–১৯ থেকে নিচের পাঁচের পূর্ণ সংখ্যা; ১–৪ থাকলে অপেক্ষা করবে। যেমন ৪৭→৪০, ৩৫→৩০, ২৫→২০, ১৫→১৫। সাপ্লায়ারের minimum/maximum quantity মানতে হবে।
- কখনো বাকি লক্ষ্যের বেশি কিনবে না। ৫০টির মধ্যে ৩০টি পাওয়ার পর বাকি ২০টি পেলেই সম্পূর্ণ; এরপর সব নজরদারি থামবে। ছোট শেষ বাকি পরিমাণ পুরো পাওয়া গেলে সেটি কেনা যাবে।
- আংশিক ডেলিভারি হলে সত্যিই যত অ্যাকাউন্ট পাওয়া গেছে সেটিই গণনা; অনিশ্চিত বাকি চার্জ মেটানো ছাড়া নতুন কেনা নয়।

## দ্রুত স্টক ধরা: সীমা ও বাস্তব ব্যবস্থা
- পাঁচ সেকেন্ডেরও কম সময়ে ধরার জন্য সাপ্লায়ার যদি প্রমাণিত restock webhook দেয়, সেটি প্রাধান্য পাবে; শুধু কল্পিত endpoint ধরে ব্যবস্থা বানানো হবে না।
- বর্তমান DigitalCore সংযোগে catalogue endpoint আছে, একক পণ্যের stock endpoint এবং webhook সমর্থন এখনো প্রমাণিত নয়। একক endpoint না থাকলে তাদের catalogue এনে শুধু নির্বাচিত পণ্য দেখবে; অন্য পণ্যের সাধারণ sync বা মূল্য পরিবর্তন করবে না।
- Push না থাকলে শুধু সক্রিয় বাই অর্ডার থাকা সময়ে দ্রুত পরীক্ষা; সাপ্লায়ারের documented rate limit ও অনুমোদিত scheduling ক্ষমতা যাচাই করে সম্ভব দ্রুততম interval নির্ধারণ। ব্রাউজার বন্ধ থাকলেও চলার ব্যবস্থা; বন্ধ/সম্পূর্ণ হলে পরীক্ষা বন্ধ।
- পাঁচ সেকেন্ডে দিনে সর্বোচ্চ ১৭,২৮০টি stock check, এক সেকেন্ডে ৮৬,৪০০টি—সাপ্লায়ার limit ও চলানোর খরচ বাড়তে পারে। একই সাপ্লায়ারের একাধিক নির্বাচিত পণ্য একই check share করবে।
- স্টক দেখা মাত্র অপ্রয়োজনীয় অপেক্ষা ছাড়া কিনবে; কিন্তু network delay, supplier rate limit ও অন্য ক্রেতার প্রতিযোগিতায় **শূন্য বিলম্ব বা সবার আগে স্টক পাওয়ার নিশ্চয়তা নেই**। প্রয়োজনীয় দ্রুত scheduling সুবিধা না থাকলে সেটি স্পষ্ট বাধা হিসেবে জানানো হবে, পাঁচ সেকেন্ডের কম বলে মিথ্যা প্রতিশ্রুতি নয়।

## অর্থ ও অ্যাকাউন্ট সুরক্ষা
- প্রতিটি ব্যাচের আগে স্থায়ীভাবে কেনার পরিচয় ও মালিকানার lock সংরক্ষণ; একাধিক পরীক্ষা বা পেজ একসঙ্গে একই ব্যাচ কিনতে পারবে না।
- DigitalCore-এর বর্তমান buy API-তে idempotency support নেই: purchase POST একবারই যাবে। Timeout/হারানো response/কেনা হয়েছে কি না অস্পষ্ট হলে **যাচাই দরকার** অবস্থায় থামবে, স্বয়ংক্রিয় দ্বিতীয় POST নয়।
- নিশ্চিত প্রত্যাখ্যান, সফল কেনা এবং অনিশ্চিত ফল আলাদা। ক্র্যাশের পরে unresolved purchase পুনরায় পাঠানো নয়; supplier order lookup থাকলে সেটি দিয়ে মিলিয়ে দেখা, না থাকলে অ্যাডমিন review।
- API keys, মূল credential delivery ও supplier-private তথ্য শুধু অনুমোদিত অ্যাডমিনের জন্য; RLS চালু, privileged writes সুরক্ষিত। Public scheduler route নিজেই header credential যাচাই করবে।

## প্রযুক্তিগত বাস্তবায়ন ও পরীক্ষা
- Additive durable buy-order/batch storage, atomic service-only claim/save RPC, authenticated admin functions এবং আলাদা monitoring processor; বিদ্যমান customer preorder/referral/notification queue-তে purchase ঢোকানো নয়।
- Supplier adapter capability অনুযায়ী stock read/purchase/lookup; Telegram কাজ যোগ করা এই ধাপের অংশ নয়।
- Focused tests: ৫০→৫০, ৩৫→৩০, ২৫→২০, ১৫→১৫, বাকি লক্ষ্যের সীমা, complete-এ stop, pause/cancel, concurrent duplicate prevention, no price preflight, unknown outcome-এ no repeat POST, admin-only TXT access।
- Preview-তে desktop/mobile ও mocked purchase/readback/TXT যাচাই। বাস্তব supplier-wallet খরচ বা publish/deploy আলাদা অনুমতি ছাড়া নয়।

---

# আগের পৃথক পরিকল্পনা: QORIX reseller API

## লক্ষ্য
- দেওয়া Prime Labs ডকসের মতো সহজ প্রবাহ: পণ্য দেখা → চূড়ান্ত দাম যাচাই → wallet দিয়ে কেনা → ডেলিভারি/অর্ডার অনুসরণ।
- রিসেলার শুধু QORIX-এর ক্যাটালগ, দাম, স্টক ও ডেলিভারি দেখবে। বাইরের supplier-এর পরিচয়, সংযোগ, খরচ ও private তথ্য দেখাবে না; admin ব্যবস্থাপনা অক্ষত থাকবে।
- পুরোনো রিসেলারের URL, key, response, দাম, অর্ডার ও balance অপরিবর্তিত রেখে নতুন সুবিধা যোগ হবে।

## প্রথম ধাপ: সহজ ও নিরাপদ সংযোগ
1. আলাদা categories, খোঁজ ও pagination, একক পণ্যে প্রযোজ্য মূল্য/স্টক/পরিমাণের স্পষ্ট তথ্য। পুরোনো product response-এর বিদ্যমান field-এর ধরন বদলাবে না।
2. অর্থ না কাটিয়ে quote: quantity অনুযায়ী বর্তমান reseller/custom/bulk/flash মূল্য, total, balance এবং shortfall। Quote ও purchase একই মূল্য নির্ধারণ ব্যবহার করবে; বর্তমান discount policy বদলাবে না।
3. `Idempotency-Key` সমর্থন, পুরোনো `external_ref`-ও অক্ষত। একই চেষ্টায় একই অর্ডার; ভিন্ন input দিয়ে একই key ব্যবহার হলে স্পষ্ট conflict। উভয় একসঙ্গে থাকলে অসামঞ্জস্য প্রত্যাখ্যান।
4. Catalogue, single-product ও purchase-এর visibility/channel যাচাই এক করা; নিজের অর্ডার ও wallet ছাড়া অন্যের তথ্য/অর্থে প্রবেশ নয়।
5. স্থায়ী request সীমা, নির্দিষ্ট error code এবং নিরাপদ retry নির্দেশনা; leaked key-ও সংশ্লিষ্ট wallet খরচ করতে পারে—ডকসে এ ঝুঁকি স্পষ্ট থাকবে।
6. পূর্বের audit-এর webhook 401-এর কারণ যাচাই; reseller-এর গ্রহণকারী সাইটে পরিবর্তন দরকার হলে তা আলাদা করে জানানো। QORIX-এর পাঠানো আপডেটে প্রযোজ্য reseller মূল্য ও visibility মানা, সীমিত parallel sends।
7. ডকস ও starter নমুনা সংশোধন: QORIX সমর্থনকারী panel লাগবে; URL/key বসালেই যেকোনো panel চলে এমন দাবি নয়। গ্রাহকের payment confirmation ছাড়া starter purchase বন্ধ; স্থায়ী retry reference, pending order readback এবং reseller balance গোপন রাখা।

## পরবর্তী সুবিধা
- নিরাপদ multi-product basket: প্রতি line-এর আলাদা ফল, একই basket retry-তে দ্বিগুণ চার্জ নয়; শুরুতে বর্তমান quantity ও stock policy বজায় থাকবে।
- নিজের paid order-এর replacement আবেদন, duplicate আবেদন আটকানো, admin review ও ফল অনুসরণ; স্বয়ংক্রিয় replacement delivery নয়।
- বট থেকে API key তৈরি/বন্ধের সুবিধা বর্তমান reseller approval বজায় রেখে; বটের সীমা যাচাই করে আলাদা পরিবর্তন।

## হুবহু কপি করা হবে না
- Reference-এর 500/100 quantity limits, partial delivery/refund ও cheapest-offer policy বর্তমান QORIX ব্যবসার নিয়মের সঙ্গে এক নয়; আলাদা অনুমোদন ছাড়া বদলাবে না।
- Activation-এর email/password গ্রহণ বা supplier-এ পাঠানো যোগ হবে না: বর্তমান নিয়ম অনুযায়ী manual orders admin হাতে পরিচালনা করবে।
- বর্তমান numeric price/stock-কে object করে পুরোনো integration ভাঙা হবে না। সম্পূর্ণ reference-compatible response দরকার হলে আলাদা version থাকবে; বর্তমান base URL বদলাবে না।

## প্রযুক্তিগত বাস্তবায়ন ও যাচাই
- TanStack public server routes, shared pure pricing/validation helpers ও authenticated owner checks; private operations service-only atomic RPC দিয়ে। RLS কখনো বন্ধ নয়।
- নতুন durable idempotency/rate-limit বা replacement data additive migration-এ; পুরোনো data delete/reset নয়।
- Rule-ভিত্তিক tests: pricing parity, retry/conflict, cross-account/channel denial, refund once, basket retries ও paid-only replacement। Mocked delivery ও isolated database tests; পুরোনো regression tests আলাদা process-এ চালানো।
- Preview-তে documentation desktop/mobile ও read-only real-key calls যাচাই। Production-এ বাস্তব order, wallet debit/credit, Telegram send অথবা publish/deploy শুধু আলাদা স্পষ্ট অনুমতিতে।

## সম্পন্ন হওয়ার মানদণ্ড
নতুন ও পুরোনো approved reseller QORIX-compatible site/bot থেকে নিরাপদে catalogue, quote, order ও tracking ব্যবহার করতে পারবে; private supplier তথ্য বাইরে যাবে না। বাস্তব charged delivery অনুমোদন না থাকলে সেটি পরীক্ষিত বলে দাবি করা হবে না।