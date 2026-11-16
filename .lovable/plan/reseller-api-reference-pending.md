# QORIX reseller API: reference parity without breaking existing resellers

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