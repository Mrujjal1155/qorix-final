# রিসেলার API নিরাপত্তা ও পুরোনো ব্যবহারের সামঞ্জস্য

## লক্ষ্য ও সীমা
বর্তমান রিসেলারদের key, দাম, discount, সফল অর্ডারের অর্থ ও delivery format অক্ষত রেখে আর্থিক ও delivery ঝুঁকি কমানো। শতভাগ ত্রুটিমুক্ত বা ক্ষতিহীন নিশ্চয়তা নয়: পরীক্ষিত সুরক্ষা এবং বাকি সীমা স্পষ্টভাবে জানানো হবে।

প্রকাশ/deploy, বাস্তব কেনাকাটা, পুরোনো balance/order মেরামত, data deletion, authentication/API-key storage পরিবর্তন এই অনুমোদনের অংশ নয়। ডেটাবেস পরিবর্তন প্রকাশ ছাড়াও live ব্যবস্থাকে প্রভাবিত করতে পারে; নতুন SQL প্রয়োগের আগে প্রভাব ও পরীক্ষার ফল জানানো হবে।

## যাচাইয়ে পাওয়া প্রধান সমস্যা
- পুরোনো financial adjustment পথে একই reference পুনরায় debit/refund হতে পারে; নতুন wrapper একাই সব পথ সুরক্ষিত করে না।
- অর্ডার ও wallet lock নেওয়ার উল্টো ক্রমে একই সময়ের কাজে সংঘর্ষ হতে পারে; shared bot/API wallet-ও সংশ্লিষ্ট।
- supplier purchase-এর transport fallback/পুরোনো retry অনিশ্চিত purchase আবার পাঠাতে পারে।
- কিছু completion write ব্যর্থ হলেও সফল উত্তর তৈরি হয়; আংশিক supplier delivery পুরো quantity সম্পন্ন হিসেবে ধরা হতে পারে।
- পুরোনো admin/recovery পথ ও নতুন terminal guard একরকম নয়; stale write সফল delivery মুছতে পারে।
- নতুন unpaid reservation আটকে থাকতে পারে; docs-এ timeout, lookup এবং কিছু error-এর ব্যাখ্যা অসম্পূর্ণ।

## বাস্তবায়নের ধাপ

### ১. আগে আলাদা পরীক্ষায় প্রমাণ ও বর্তমান ব্যবহারের তালিকা
- সব reseller endpoint, supplier attempt, wallet writer, recovery, panel ও Telegram admin caller-এর তালিকা তৈরি।
- বাস্তব ডেটা না বদলে duplicate transaction, অমিল order/ledger, pending/terminal অবস্থার aggregate যাচাই। অমিল পেলে স্বয়ংক্রিয় repair নয়।
- পুরোনো ও নতুন অর্ডারের fixtures; একসঙ্গে request, response হারানো, আংশিক delivery ও save failure-এর regression পরীক্ষা।
- বিস্তারিত security scan-এর ফল প্রাসঙ্গিক হলে এই তালিকায় যোগ করা; unrelated বা owner-dismissed finding পরিবর্তন নয়।

### ২. সীমিত API ও সংরক্ষণের সংশোধন
- non-object/null JSON-এ নিয়ন্ত্রিত 400; read failure-এ মিথ্যা empty success/404 নয়, নিরপেক্ষ 503।
- বর্তমান valid quantity/channel/limit ও lookup আচরণ বজায় রেখে invalid input সামলানো।
- save নিশ্চিত না হলে completed response নয়; একই order readback, দরকার হলে reconciliation। আরেকবার supplier purchase নয়।
- completed/refunded/terminal অর্ডারের delivery ও financial identity stale write দিয়ে বদলানো বন্ধ। Meta বর্তমান row থেকে merge।
- পুরোনো রিসেলার ব্যবহার ভাঙতে পারে এমন প্রত্যেক পরিবর্তন পৃথক পরীক্ষা ও compatibility gate পাবে।

### ৩. কেন্দ্রীয় অর্থ স্থানান্তর ও recovery
- order-bound canonical debit/refund; debit, ledger ও order state একই transaction-এ; refund কেবল নিশ্চিত delivery failure-এর original debit-এর জন্য।
- একবার refund হলে failed terminal; cancel/expire-এ refund নয়; সম্পন্ন delivery অপরিবর্তিত।
- সব সংশ্লিষ্ট writer-এর consistent lock order পরীক্ষা; shared wallet বদল প্রয়োজন হলে আলাদা প্রভাব-রিপোর্ট, অনুমান করে চালু নয়।
- পুরোনো caller migration ও historical compatibility যাচাইয়ের আগে generic adjustment সীমিত করা বা historical unique constraint যোগ করা নয়।
- recovery-তে atomic claim ও পুনরুদ্ধারযোগ্য lease; response failure মানেই debit হয়নি এমন ধারণা নয়। নতুন unpaid reservation পরে stale pre-check দিয়ে debit নয়।

### ৪. supplier attempt ও delivery সুরক্ষা
- purchase POST-এর অনিশ্চিত ফলাফলে host fallback/automatic repurchase বন্ধ; read retry অক্ষত।
- stable persisted attempt reference ও atomic claim; একই অর্ডারে parallel retry থেকে একটিমাত্র purchase attempt।
- supplier-এর explicit status/code ব্যবহার; response text দিয়ে আর্থিক সিদ্ধান্ত নয়।
- per-unit purchase-এর সফল unit ও reference সংরক্ষণ; supplier-specific contract অনুযায়ী quantity completion যাচাই, credential line count দিয়ে অনুমান নয়।
- unknown/partial ফল ও local-save uncertainty quarantine/reconciliation; প্রমাণ ছাড়া refund বা missing-unit repurchase নয়।
- admin manual completion, retry ও notification আলাদা; delivery notification retry কখনো stock আবার কেনে না।

### ৫. ডক্স ও শেষ রিপোর্ট
- বর্তমান response shape, duplicate HTTP status, input truncation, lookup precedence, list সীমা, 400/402/409/500/503 এবং অনিশ্চিত ফলের করণীয় লেখা।
- key/price/discount/পণ্য/checkout link অক্ষত থাকার তুলনামূলক পরীক্ষা।
- প্রতি নিয়মের concrete test, suite pass/fail, build ফল, বাকি blocker ও পরিবর্তিত ফাইলের রিপোর্ট।
- owner-এর পৃথক অনুমোদন ছাড়া বাস্তব paid test বা publish নয়।

## বাধা ও থামার শর্ত
- supplier-এর idempotency/lookup/quantity contract নিশ্চিত না হলে সংশ্লিষ্ট অংশ থামবে; supplier identity/credentials গ্রাহকের উত্তরে যাবে না।
- historical unknown/partial purchase বা ledger mismatch স্বয়ংক্রিয় repair নয়।
- পুরোনো bot cancellation-refund policy বা সফল reseller ব্যবহারের সঙ্গে সংঘাত হলে পুরোনো আচরণ থাকবে এবং নির্দিষ্ট সিদ্ধান্ত চাওয়া হবে।
- live signed-in paid end-to-end যাচাই এখনো বাকি; isolated test পাসকে live certification বলা হবে না।

## প্রযুক্তিগত বিবরণ
- বিদ্যমান TanStack server layer ও service-only Supabase RPC ব্যবহার; RLS চালু থাকবে।
- কোনো destructive schema migration, key rotation/hashing পরিবর্তন বা historical mass tagging নয়।
- SQL concurrency আলাদা PostgreSQL sessions-এ পরীক্ষা; sequential mock বা embedded single-connection পরীক্ষা দিয়ে concurrency নিশ্চয়তা নয়।
- endpoint response fields ও successful purchase accounting regression fixtures দিয়ে ধরে রাখা হবে।