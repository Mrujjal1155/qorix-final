# QORIX Reseller Starter Kit

ডকুমেন্টেশনের ধাপগুলোর রেডিমেড কোড। কপি করে নিজের সার্ভারে চালালেই আপনার
নিজের ওয়েবসাইট বা Telegram bot চলবে — QORIX থেকে প্রোডাক্ট, দাম আর ডেলিভারি
স্বয়ংক্রিয়ভাবে আসবে।

## ১. সেটআপ

```bash
cd examples/reseller-site
cp .env.example .env      # QORIX_KEY বসান (Reseller Panel → API key)
npm start                 # http://localhost:3000
```

Telegram bot চালাতে:

```bash
npm run bot               # .env এ BOT_TOKEN লাগবে
```

Node 20+ লাগবে। কোনো npm dependency নেই।

## ২. সেটিংস (.env)

| ভ্যারিয়েবল | মান | ব্যাখ্যা |
| --- | --- | --- |
| `QORIX_API` | `https://qorixlab.com/api/public/reseller/v1` | API base URL |
| `QORIX_KEY` | `qxr_...` | আপনার reseller API key (শুধু সার্ভারে) |
| `MARKUP` | `1.25` | আপনার মার্জিন — ২৫% বেশি দামে বিক্রি |
| `PORT` | `3000` | স্টোরফ্রন্ট পোর্ট |
| `BOT_TOKEN` | BotFather token | Telegram bot চালালে |

## ৩. ফাইলগুলো

- `server.mjs` — প্রোডাক্ট লিস্ট + Buy now + ইনস্ট্যান্ট ডেলিভারি দেখানো
- `telegram-bot.mjs` — `/start`, `/products`, `/balance` + ইনলাইন বাটনে কেনা
- `.env.example` — সব সেটিংস

## ৪. যেভাবে কাজ করে

1. `GET /products?channel=website|bot` → লাইভ প্রোডাক্ট ও আপনার reseller দাম
2. `POST /orders` → আপনার ব্যালেন্স থেকে কাটা হয়, auto প্রোডাক্ট হলে সাথে সাথেই
   `order.items[]` এ ডেলিভারি আসে
3. `GET /me` → ব্যালেন্স, `GET /orders` → অর্ডার হিস্ট্রি

## ৫. নিরাপত্তা নিয়ম

- API key কখনো ব্রাউজার/বট ক্লায়েন্ট কোডে রাখবেন না — শুধু সার্ভারে।
- প্রতিটি অর্ডারে ইউনিক `external_ref` পাঠান (এখানে `randomUUID()`)। একই ref
  আবার পাঠালে নতুন চার্জ হয় না, আগের অর্ডারই ফেরত আসে — তাই retry নিরাপদ।
- গ্রাহকের পেমেন্ট নিশ্চিত হওয়ার **পরে** `POST /orders` কল করুন।
- ব্যালেন্স কম থাকলে API `Insufficient balance` দেবে — Reseller Panel →
  Balance ট্যাব থেকে ইনস্ট্যান্ট টপ-আপ করুন।

## ৬. লাইভে দেওয়া

- আপনার সার্ভারে `.env` সেট করে `npm start` (pm2/systemd/Docker যেকোনোটি)
- ডোমেইনে HTTPS দিন, তারপর গ্রাহকদের লিংক দিন
- সম্পূর্ণ API রেফারেন্স: https://qorixlab.com/reseller/docs
