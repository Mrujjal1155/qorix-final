# সাধারণ Bybit অ্যাকাউন্টে Bybit Pay পেমেন্ট

## কী যোগ হবে
- Telegram bot ও website-এর পেমেন্ট তালিকায় Binance-এর পাশে **Bybit Pay** থাকবে। Bot-এর পণ্য কেনা ও wallet deposit—দুই ক্ষেত্রেই ব্যবহার করা যাবে।
- Admin-এ আলাদা **Bybit Pay** বিভাগ: চালু/বন্ধ, প্রাপকের Bybit UID, API Key ও Secret দেওয়ার নিরাপদ ব্যবস্থা, সংযোগ পরীক্ষা এবং পেমেন্ট যাচাইয়ের অবস্থা। সংরক্ষিত গোপন তথ্য ফেরত দেখানো হবে না।
- গ্রাহক দেখানো UID-তে নির্ধারিত USDT পাঠিয়ে **Internal Transfer Transaction ID** জমা দেবেন। API-তে সফলভাবে আসা পেমেন্ট, সঠিক ID, USDT এবং হুবহু নির্ধারিত টাকা মিললেই পেমেন্ট অনুমোদিত হবে। বাড়তি/র‌্যান্ডম টাকা যোগ হবে না।
- জমা দেওয়া ID তাৎক্ষণিক যাচাই হবে; তখনো টাকা না পৌঁছালে নির্ধারিত সময়ের মধ্যে স্বয়ংক্রিয় পুনঃযাচাই চলবে। নিশ্চিত পেমেন্টের পরে বিদ্যমান delivery/wallet ব্যবস্থা ব্যবহার হবে।

## গুরুত্বপূর্ণ সীমা
- আপনারটি সাধারণ Bybit account, Merchant account নয়। এই পরিকল্পনা Bybit-এর **internal deposit history** ব্যবহার করবে—Merchant QR/order API নয়।
- UI-তে নাম **Bybit Pay** হলেও নির্দেশনায় স্পষ্ট থাকবে এটি Bybit UID/internal transfer। Merchant Pay order ID বা সাধারণ screenshot পেমেন্টের প্রমাণ হিসেবে গ্রহণ করা হবে না।
- Bybit-এর API-তে কোনো transfer দৃশ্যমান না হলে সেটি স্বয়ংক্রিয়ভাবে paid হবে না। API সংযোগ ও উপযুক্ত read permission যাচাইয়ের আগে gateway বন্ধ থাকবে।
- প্রথম সংস্করণে blockchain deposit ও Merchant QR checkout যোগ হবে না; Binance এবং অন্য চালু পেমেন্ট অপরিবর্তিত থাকবে।

## নিরাপত্তা ও যাচাই
- একই Bybit transaction দিয়ে দ্বিতীয় অর্ডার বা দ্বিতীয় wallet credit হবে না; Binance ও Bybit-এর transaction পরিচয় আলাদা থাকবে।
- ব্যর্থ/pending transfer, ভুল ID, অন্য currency, কম/বেশি টাকা, আগের লেনদেন অথবা API outage—কোনোটিই paid করবে না।
- RLS চালু থাকবে; credentials শুধু অনুমোদিত admin-এর মাধ্যমে নিরাপদে সংরক্ষণ হবে, public/browser response বা logs-এ থাকবে না। API-তে withdrawal/trading কাজ করা হবে না।
- বিদ্যমান payment regression tests এবং Bybit-এর success/pending/failed, exact amount, duplicate ID ও repeated settlement পরীক্ষা চালানো হবে। Bot ও website-এ নির্বাচন → ID জমা → যাচাই → ফলাফল flow পরীক্ষা হবে; বাস্তব টাকা বা গ্রাহকের অর্ডার পরীক্ষার জন্য ব্যবহার করা হবে না।
- credentials, signed-in admin বা deployed bot অনুপলব্ধ থাকলে যেটুকু live যাচাই করা যায়নি তা স্পষ্টভাবে জানানো হবে। বাস্তব পেমেন্টের আগে আপনার অনুমতি লাগবে।

## কারিগরি বাস্তবায়ন
- Bybit V5 signed GET: `GET /v5/asset/deposit/query-internal-record`, `txID`, `coin=USDT` ও সীমিত time window। API success-এর পাশাপাশি deposit `status=2` এবং `type=1` আবশ্যক।
- server-only HMAC-SHA256 signing ব্যবহার হবে; retail transfer records-কে Merchant Pay records হিসেবে গণ্য করা হবে না। Static-key connector দিয়ে Bybit-এর dynamic signature অনুমান করে সংযোগ করা হবে না।
- Binance-এর credential status/write pattern অনুসরণ করে admin-authorized Bybit credential write এবং service-only read; সাধারণ settings-এ private keys নয়।
- Provider-aware transaction ledger এবং service-only atomic settlement দিয়ে deposit/order lock, duplicate claim ও wallet credit একসঙ্গে commit হবে। Website fulfillment ও bot delivery বিদ্যমান recovery path ধরে চলবে।
- বিদ্যমান authenticated scheduler-এ Bybit recheck যুক্ত হবে; scheduler credential শুধু headers-এ, URL-এ নয়। Telegram callbacks ৬৪ byte-এর মধ্যে ও message সীমা মেনে থাকবে।

## নথির ভিত্তি
- [Bybit internal deposit records](https://bybit-exchange.github.io/docs/v5/asset/deposit/internal-deposit-record)
- [Bybit API authentication](https://bybit-exchange.github.io/docs/v5/guide)
- [Merchant Pay API—এই পরিকল্পনার বাইরে](https://bybit-exchange.github.io/pay-docs/scan-payment/payment-result)