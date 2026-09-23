# n8n AI Automation — existing bot + existing Supabase

বর্তমান অবস্থা (inspect করে পাওয়া):

- Telegram bot আপনার নিজের সাইটেই চলে: Telegram → `/api/public/telegram/webhook` → `handleUpdate` (bot engine)। Webhook নিজে থেকেই qorixlab.com-এ রেজিস্টার থাকে।
- Supabase সংযোগ: server-side service key (`client.server.ts`) শুধু সার্ভারে; ফ্রন্টএন্ডে শুধু public key।
- Product তথ্য `products` টেবিলে: name, price, old_price, description, delivery_time, stock, is_active, category ইত্যাদি।
- বটে এখন অচেনা টেক্সট এলে শুধু "Use /start to open the menu." যায় — এই জায়গাটাই AI-এর জন্য ব্যবহার করব।

## যা যোগ হবে (existing কিছু বদলাবে না)

1. **n8n-কে message পাঠানো**
   বটে যখন কোনো মেনু/কমান্ড/স্টেটে না-পড়া সাধারণ প্রশ্ন আসে (যেমন "Gemini Pro কত টাকা?"), সেটি n8n webhook URL-এ POST হবে: chat_id, user id/username, text, message_id।
   - চালু/বন্ধ করা যাবে অ্যাডমিন থেকে; বন্ধ থাকলে আগের আচরণ হুবহু।
   - n8n না পেলে/ব্যর্থ হলে পুরোনো "Use /start" বার্তাই যাবে।
   - কোনো কমান্ড, বোতাম, অর্ডার, পেমেন্ট, alert লজিক স্পর্শ করা হবে না।

2. **Secure product search API (n8n → Supabase)**
   `POST /api/public/n8n/products/search` — header `X-N8N-Key`।
   - Body: `{ query, limit? }`; শুধু **read-only**, শুধু active/allowed পণ্যের ফিল্ড: name, emoji, price, old_price, duration (delivery_time), description, category, in-stock status, বট লিংক।
   - কোনো write/delete/update নেই, service key শুধু সার্ভারে, ফ্রন্টএন্ডে কিছুই যাবে না।
   - সাথে `POST /api/public/n8n/products/list` নয় — একই endpoint-এ query ফাঁকা দিলে টপ পণ্যগুলো ফিরবে।

3. **n8n → Telegram reply**
   `POST /api/public/n8n/telegram/send` — একই `X-N8N-Key`; body `{ chat_id, text, reply_to? }`।
   - existing bot token দিয়েই উত্তর যাবে, টোকেন n8n-এ দিতে হবে না।
   - শুধু টেক্সট পাঠানো যাবে (কোনো অ্যাডমিন কাজ নয়)।

4. **Admin panel**
   Settings-এ দুটি নতুন ঘর: `n8n webhook URL` এবং `AI auto-reply (on/off)`।

5. **Secret**
   নতুন `N8N_API_KEY` তৈরি হবে (server-only)। এটি n8n-এর HTTP Request node-এর header-এ বসাতে হবে — আমি মান দেখাতে পারব না, তাই চাইলে আপনি নিজের key দিতে পারেন।

## Flow

```text
Telegram user → existing bot → /api/public/telegram/webhook
   → (unmatched question) → n8n webhook
      → n8n: POST /api/public/n8n/products/search  (Supabase live data)
      → AI (n8n-এর AI node) — শুধু ওই ডেটা থেকেই উত্তর
      → POST /api/public/n8n/telegram/send → user
```

## যা করা হবে না

- Website UI/UX, bot menu/commands/buttons, order/payment/supplier লজিক — কিছুই বদলাবে না।
- নতুন database/backend নেই; existing `products` টেবিলই পড়া হবে।
