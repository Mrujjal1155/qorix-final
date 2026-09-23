# n8n AI Automation — সেটআপ (Bangla)

Base URL: `https://qorixlab.com`

## ১) Admin → Settings

- **n8n shared key** — যেকোনো লম্বা random string (যেমন `openssl rand -hex 32`)।
- **n8n webhook URL** — n8n Webhook node-এর Production URL।
- **n8n AI auto-reply** — ON করলে বটের মেনু-বহির্ভূত প্রশ্ন n8n-এ যাবে।

(চাইলে Cloudflare-এ `N8N_API_KEY` secret দিলে সেটাই অগ্রাধিকার পাবে।)

## ২) n8n flow

1. **Webhook (POST)** — বট পাঠায়:
   `{ source, chat_id, message_id, text, user: { id, username, first_name, language_code } }`
2. **HTTP Request — product search**
   - POST `https://qorixlab.com/api/public/n8n/products/search`
   - Header: `X-N8N-Key: <shared key>`
   - Body: `{ "query": "{{ $json.text }}", "limit": 8 }`
   - Response: `products[]` → name, emoji, category, price (BDT), old_price,
     duration, description, important_note, in_stock, stock, delivery, bot_link
3. **AI node** — system prompt-এ লিখুন: শুধু উপরের JSON থেকেই উত্তর দাও,
   কোনো দাম/স্টক নিজে থেকে বানাবে না; না পেলে বলো পণ্যটি পাওয়া যাচ্ছে না।
4. **HTTP Request — reply**
   - POST `https://qorixlab.com/api/public/n8n/telegram/send`
   - Header: `X-N8N-Key: <shared key>`
   - Body: `{ "chat_id": {{ $json.chat_id }}, "text": "<AI উত্তর>" }`
   - HTML parse mode; `reply_to` (message_id) দিলে reply আকারে যাবে।

## নিরাপত্তা

- Bot token ও Supabase service key শুধু সার্ভারে — n8n-এ যায় না।
- endpoint দুটি read-only (search) ও send-only (reply); কোনো write/delete নেই।
- ভুল/অনুপস্থিত key → 401।
- n8n বন্ধ বা ব্যর্থ হলে বট আগের মতোই "Use /start" উত্তর দেয়; বাকি সব ফিচার অপরিবর্তিত।
