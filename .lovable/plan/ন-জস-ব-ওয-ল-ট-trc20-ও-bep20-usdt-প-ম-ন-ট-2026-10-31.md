# নিজস্ব ওয়ালেটে TRC20 ও BEP20 USDT পেমেন্ট

## যা যোগ হবে
- Telegram বট ও ওয়েবসাইটে **USDT · TRC20** এবং **USDT · BEP20** নামে দুটি আলাদা পেমেন্ট অপশন। Binance, Bybit ও OxaPay অপরিবর্তিত থাকবে।
- দুটিই শুরুতে **বন্ধ** থাকবে। আপনি ঠিকানা/API setup শেষ করে সংযোগ পরীক্ষা করবেন, তারপর নিজে চালু করবেন। সংযোগ পরীক্ষা সফল হলেও নিজে থেকে চালু হবে না।
- অ্যাডমিনে **Blockchain USDT** বিভাগ: প্রতিটি নেটওয়ার্কের receiving address, API সংযোগের অবস্থা, Test connection, চালু/বন্ধ, সর্বশেষ সফল পরীক্ষা ও সর্বশেষ লেনদেন শনাক্ত করার সময়। Trust Wallet বা অন্য নিজের ওয়ালেটের ঠিকানা ব্যবহার হবে; seed phrase/private key লাগবে না।
- API key সাধারণ সেটিংসের ঘরে বা উন্মুক্ত ডেটায় রাখা হবে না। নিরাপদ সংযোগ-ফর্মে API setup হবে; অ্যাডমিনে সেটআপের নির্দেশনা ও configured/not configured অবস্থা থাকবে, সংরক্ষিত key ফেরত দেখানো হবে না।

## আপনার নির্ধারিত পেমেন্ট নিয়ম
1. ক্রেতা নেটওয়ার্ক নির্বাচন করে নির্ধারিত USDT পাঠাবেন, এরপর **TXID জমা দেবেন**। বাড়তি শনাক্তকরণ-টাকা যোগ হবে না।
2. জমা দেওয়া TXID-এর সফল token transfer-এ নির্বাচিত নেটওয়ার্ক, অনুমোদিত USDT contract, আপনার receiving address, নির্ধারিত **হুবহু amount**, পেমেন্ট প্রচেষ্টার সময় এবং প্রয়োজনীয় finality মিলতে হবে।
3. যাচাই চলাকালে pending থাকবে; confirmed/finalized না হলে payment success হবে না। API সমস্যা বা limit হলে পরে আবার পরীক্ষা হবে, paid বানানো হবে না।
4. একই লেনদেন দিয়ে দ্বিতীয়বার টাকা যোগ বা অর্ডার পরিশোধ হবে না। যাচাই ও wallet/order settlement একসঙ্গে নিরাপদভাবে সম্পন্ন হবে।
5. TXID জমা না দেওয়া লেনদেন শনাক্ত হলেও কোনো ক্রেতার নামে শুধু amount দেখে টাকা যোগ হবে না। কম/বেশি টাকা, পুরোনো, দেরিতে আসা বা অমিল লেনদেন অ্যাডমিনে review অবস্থায় থাকবে।

## লেনদেন তালিকা
- অ্যাডমিনে দুটি ঠিকানার শনাক্ত করা incoming/outgoing USDT transfer, নেটওয়ার্ক, TXID, amount, sender/receiver, confirmation এবং matched/unmatched অবস্থা দেখাবে। অন্য token বা native TRX/BNB-কে USDT পেমেন্ট হিসেবে গ্রহণ করবে না।
- সংযোগ পরীক্ষায় API কাজ করছে, সঠিক mainnet/token পড়া যাচ্ছে এবং ঠিকানা বৈধ কি না যাচাই হবে। এটি ওয়ালেটের মালিকানা বা বাস্তব টাকা পাওয়ার পরীক্ষা নয়।
- API pagination ও সংরক্ষিত cursor দিয়ে চালু করার পরের লেনদেন পর্যায়ক্রমে সংগ্রহ হবে; প্রথমে সীমিত সাম্প্রতিক ইতিহাস দেখানো যাবে, কিন্তু পুরোনো লেনদেন নিজে থেকে credit হবে না।

## সীমা ও নোটিশ
- Blockchain-এ সবার জন্য একই বাধ্যতামূলক minimum USDT payment নেই। অ্যাপের বিদ্যমান minimum অপরিবর্তিত থাকবে; নতুন minimum বানানো হবে না। কোনো বিদ্যমান সীমা বা API পরিকল্পনার সীমা থাকলে সঠিক notice থাকবে।
- ক্রেতার পাঠানোর network fee আলাদা: TRC20-এ TRX/energy এবং BEP20-এ BNB লাগে। Receiving wallet-এ নির্ধারিত পুরো USDT পৌঁছাতে হবে; fee-এর স্থির অঙ্ক বানানো হবে না।
- ভুল নেটওয়ার্ক, ভুল token বা ভুল ঠিকানায় পাঠালে auto verification হবে না। API indexing/confirmation-এর কারণে সময় লাগতে পারে।
- TRC20-এর জন্য TronGrid; BEP20-এর জন্য Etherscan V2/BSC API সংযোগ পরীক্ষা করবে। Provider-এর বর্তমান plan/quota অনুযায়ী request pacing থাকবে; BSC endpoint ব্যবহারে paid plan লাগতে পারে, বিনামূল্যের নিশ্চয়তা দেওয়া হবে না।
- **গুরুত্বপূর্ণ:** TXID blockchain-এ প্রকাশ্য। TXID ও amount মেলা টাকা পৌঁছানোর প্রমাণ, জমাদানকারীই প্রেরক তার প্রমাণ নয়। আপনার চাওয়া TXID-ভিত্তিক প্রবাহ থাকবে, তবে অ্যাডমিনে এই সীমাবদ্ধতা স্পষ্ট থাকবে; একই TXID পুনর্ব্যবহার বন্ধ করলেও প্রথমে অন্যের TXID দাবি করার ঝুঁকি পুরো দূর হয় না।

## প্রযুক্তিগত ব্যবস্থা
- TRON mainnet: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`, 6 decimals। BSC mainnet chain ID 56: `0x55d398326f99059ff775485246999027b3197955`, 18 decimals; এটি Binance-Peg BSC-USD, প্রচলিত BEP20 USDT। Token নাম দেখে অন্য contract গ্রহণ হবে না।
- Pure shared validation/matching helpers; decimal-safe integer units; token Transfer event ও সফল receipt যাচাই। TRON solidified ফল, BSC finalized ফল অথবা documented conservative confirmation policy ছাড়া credit নয়।
- API credentials নিরাপদ connector-এ; শুধু server-side calls। Admin functions বিদ্যমান authenticated middleware ও server-side admin authorization ব্যবহার করবে। কোনো key সাধারণ `bot_settings` বা frontend-এ নয়।
- Dedicated payment attempt/transfer ledger, service-only atomic claim/settlement RPC, explicit grants ও RLS; unique chain/TXID claim দিয়ে replay বন্ধ। Customer safe projections; address বদলালেও pending attempt-এর saved address/amount অপরিবর্তিত।
- বিদ্যমান authenticated notify/payment tick-এ bounded scanning/retry; scheduler credentials শুধু header-এ। Rate-limit backoff, pagination এবং durable progress থাকবে।
- Telegram button/message সীমা মেনে বিদ্যমান payment/credential-delivery flow ব্যবহার। নতুন বিভাগে app-specific page metadata এবং বিদ্যমান সব admin theme বজায় থাকবে।

## পরীক্ষা ও হস্তান্তর
- TRC20/BEP20 exact amount, decimals, wrong token/address/network, failed/unconfirmed/old transaction, duplicate/concurrent claim, disabled gateway এবং API outage/rate limit-এর focused tests। বিদ্যমান Binance/Bybit settlement regression tests চালানো হবে।
- অ্যাডমিন সংযোগ পরীক্ষা ও checkout/TXID জমার নমুনা flow যাচাই; বাস্তব transfer, customer credit বা stock delivery করা হবে না।
- দুটি অপশন বন্ধ অবস্থায় হস্তান্তর; আপনি API ও ঠিকানা setup করে নিজে active ও বাস্তব payment test করবেন। External Supabase-এর signed-in admin access ও বাহ্যিক live deployment এখানে যাচাই সম্ভব না হলে সেটি স্পষ্ট জানানো হবে।

## তথ্যসূত্র
- [TronGrid API](https://developers.tron.network/reference/trongrid-v1-api-overview), [rate limits](https://developers.tron.network/reference/rate-limits), [TRON confirmation](https://developers.tron.network/docs/confirmation-semantics)
- [Etherscan token transfers](https://docs.etherscan.io/api-reference/endpoint/tokentx), [API limits](https://docs.etherscan.io/resources/rate-limits), [supported chains](https://docs.etherscan.io/supported-chains)
- [BSC token contract](https://bscscan.com/token/0x55d398326f99059ff775485246999027b3197955), [BSC finality API](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/bsc-api-list/)