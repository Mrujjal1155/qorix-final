# Manual delivery: কাস্টমারের তথ্য নেওয়া + admin দিয়ে complete করা

## এখন কী আছে
- product-এ আগে থেকেই "auto / manual" delivery বেছে নেওয়ার ব্যবস্থা আছে, manual order "pending" অবস্থায় থাকে।
- যা নেই: কাস্টমারের কাছে তথ্য চাওয়া (যেমন email), order-এ সেই তথ্য দেখানো, "Manual" চিহ্ন, আর admin-এর নোট লিখে complete করা।

## যা যোগ হবে

**১. Product Edit (in-house ও supplier দুই ধরনের product-এই)**
- Delivery: Auto / Manual বেছে নেওয়া।
- Manual বাছলে নতুন ঘর খুলবে:
  - **কাস্টমারকে কী জিজ্ঞেস করবেন** (যেমন: "Please enter email(s) to receive slot, one per line" + উদাহরণ)
  - **তথ্যের ধরন**: Email / সাধারণ লেখা / কিছু না
  - **প্রতি লাইনে ১টা = quantity** (চালু থাকলে যতগুলো email দেবে, তত quantity ধরা হবে — screenshot-এর মতো)
  - **কতক্ষণ লাগবে** (যেমন "1–12 hours")
- Supplier sync এই সেটিংস মুছবে না।

**২. Bot-এ কেনার ধাপ**
```text
Buy -> বট প্রশ্ন দেখাবে (আপনার লেখা) -> কাস্টমার তথ্য দেবে
    -> ভুল email হলে আবার চাইবে -> payment বাছাই -> payment
    -> "✅ Payment received for order #X. 🛠 Admin is processing it. Estimated time: ... You will be notified when it is done."
```
- Wallet, Binance, USDT সব payment-এ একই।

**৩. Admin-এ জানানো**
- Payment হওয়ামাত্র admin-কে Telegram-এ message: order নম্বর, product, quantity, কাস্টমারের দেওয়া তথ্য।

**৪. Admin Orders পেজ**
- Manual order-এ **"MANUAL"** চিহ্ন, আর "Manual pending" ফিল্টার।
- Order খুললে কাস্টমারের দেওয়া তথ্য (copy করা যাবে)।
- **"Complete"** চাপলে একটা popup: নোট/ডেলিভারি details লেখার ঘর -> Complete।
- Complete হলে: order "completed", কাস্টমার বটে পাবে: "✅ Completed: <নোট> — <product>" (screenshot ৩-এর মতো), sale announcement আগের মতো যাবে।
- বট admin panel থেকেও একই ভাবে নোট লিখে complete করা যাবে।

**৫. Reseller API / ওয়েবসাইট**
- API-তে manual product কিনতে এই তথ্য `fields` হিসেবে পাঠানো যাবে; না পাঠালে পরিষ্কার error।

## যা বদলাবে না
- Auto-delivery product, দাম, ডিজাইন, payment নিয়ম — সব আগের মতো।
- পুরোনো manual product-এ প্রশ্ন না লিখলে আগের মতোই কাজ করবে।

## Technical details
- `products.details` (jsonb, আগে থেকে আছে)-এ `manual_input: { prompt, kind: "email"|"text"|"none", qty_per_line, eta }` রাখা — নতুন কলাম/migration লাগবে না। Supplier sync-এ `details.manual_input` সংরক্ষিত রাখা।
- কাস্টমারের উত্তর `orders.meta.manual_input` (array) এবং admin নোট `orders.meta.manual_note` / `delivered_content`-এ।
- Bot state (`bot_users.state`)-এ নতুন step `await_manual_input`; zod দিয়ে email যাচাই, সর্বোচ্চ ৫০ লাইন/২০০০ অক্ষর, HTML escape।
- নতুন admin server fn `completeManualOrder({ orderId, note })` (admin role যাচাই), একবারই complete হবে (status=pending শর্তে update)।
- RLS অপরিবর্তিত।
