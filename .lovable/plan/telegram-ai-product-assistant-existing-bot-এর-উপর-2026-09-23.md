# Telegram AI Product Assistant (existing bot-এর উপরে)

বিদ্যমান ওয়েবসাইট, বট, ডাটাবেজ — কিছুই বদলাবে না। শুধু একটি নতুন স্তর যোগ হবে: গ্রাহক বটে সাধারণ প্রশ্ন লিখলে (যেমন "Gemini Pro কত টাকা?") বট ডাটাবেজ থেকে আসল পণ্যের তথ্য খুঁজে বাংলায় উত্তর দেবে।

## এখন কী হয় (যাচাই করা)

- বটে কোনো বোতাম/কমান্ডের সাথে না মেলা টেক্সট লিখলে শুধু উত্তর আসে: "Use /start to open the menu."
- ঠিক এই জায়গাটিতেই (engine-এর শেষ `default` শাখা) AI উত্তর বসবে। এর আগের সব ধাপ — /start, /menu, /products, wallet, support, admin, deposit, stock add, ticket reply ইত্যাদি — সম্পূর্ণ অপরিবর্তিত থাকবে।

## কী তৈরি হবে

1. **পণ্য সার্চ ফাংশন** (নতুন ফাইল, শুধু সার্ভারে চলে)
   - `products` টেবিলের আসল কলাম ব্যবহার: `name`, `description`, `price`, `old_price`, `delivery_time`, `delivery_type`, `is_active`, `supplier_stock`, `details`, `badge`, `emoji` + `categories.name`।
   - শুধু পড়া (read-only), শুধু `is_active = true` পণ্য।
   - নাম-ভিত্তিক নমনীয় মিল: "gemini", "জেমিনি", "gemini pro", "lovable lite" — সব একই পণ্যে পৌঁছাবে (বাংলা→ইংরেজি সাধারণ নামের ম্যাপিং + শব্দভিত্তিক স্কোরিং)।
   - স্টক: auto পণ্যের জন্য বিদ্যমান `stock_counts`, supplier পণ্যের জন্য `supplier_stock` — অর্থাৎ বটের বাকি অংশ যা দেখায়, ঠিক তাই।
   - সর্বোচ্চ ৮টি পণ্য AI-কে দেওয়া হবে; AI-এর ডাটাবেজে কোনো সরাসরি অ্যাক্সেস থাকবে না।

2. **AI উত্তর স্তর** (নতুন ফাইল, সার্ভার-only)
   - Lovable AI (`LOVABLE_API_KEY`, ইতিমধ্যে সেট) দিয়ে উত্তর তৈরি।
   - কঠোর নিয়ম prompt-এ: শুধু পাঠানো ডেটা থেকে উত্তর, দাম/স্টক কখনো বানাবে না, না পেলে স্পষ্ট করে বলবে।
   - উত্তর ছোট, বন্ধুত্বপূর্ণ বাংলা, সীমিত emoji; শেষে "Products" বোতাম যাতে গ্রাহক সরাসরি অর্ডারে যেতে পারে।
   - AI বা নেটওয়ার্ক ফেল করলে: ডাটাবেজ থেকে পাওয়া পণ্যের সাধারণ কার্ড দেখাবে, কিছু না পেলে আগের মতোই মেনু বার্তা — গ্রাহক কখনো technical error দেখবে না।

3. **সংক্ষিপ্ত কথোপকথনের প্রসঙ্গ**
   - ব্যবহারকারীর বিদ্যমান `state`-এ শেষ ২টি প্রশ্ন/পণ্য মনে রাখা হবে, যাতে "কত টাকা?" আগের পণ্য বোঝে। দাম/স্টক সবসময় নতুন করে ডাটাবেজ থেকেই নেওয়া হবে।

4. **অ্যাডমিন সুইচ (ডিজাইন অপরিবর্তিত)**
   - `bot_settings`-এ নতুন কী `ai_assistant_enabled` (`1`/`0`)। Admin → Settings-এ একটি ছোট ঘর।
   - `0` দিলে সব আগের মতোই ("Use /start to open the menu.")।

## কী বদলাবে না

- কোনো টেবিল, কলাম, RLS বা মাইগ্রেশন নয় (শুধু `bot_settings`-এ একটি সাধারণ সেটিং রো)।
- ওয়েবসাইটের UI/UX-এ কোনো পরিবর্তন নেই।
- বটের কোনো কমান্ড, বোতাম, মেনু, অর্ডার/পেমেন্ট লজিক স্পর্শ করা হবে না।
- Bot token, webhook, Supabase সংযোগ — সবই বর্তমানটাই পুনর্ব্যবহার।

## প্রযুক্তিগত বিবরণ

- নতুন: `src/lib/bot/product-search.server.ts` (`searchProducts(query, limit)`), `src/lib/bot/ai-assistant.server.ts` (`aiProductReply(chatId, text, state)`)।
- পরিবর্তিত: `src/lib/bot/engine.server.ts` — শুধু `handleMessage`-এর শেষ `default:` শাখা; `src/routes/admin/settings.tsx` — একটি সেটিং ফিল্ড।
- Model: `openai/gpt-6-astra` (Responses API, streaming সার্ভারে consume করে সম্পূর্ণ টেক্সট)।
- Env: শুধু বিদ্যমান `LOVABLE_API_KEY`, `TELEGRAM_BOT_TOKEN`, Supabase keys — নতুন কিছু লাগবে না।
- পরবর্তী ধাপের জন্য প্রস্তুত: সার্চ ফাংশন পণ্যের `id` ফেরত দেয়, তাই পরে "Order now" বোতাম বিদ্যমান `productView`/checkout-এ সরাসরি যুক্ত করা যাবে।

## টেস্ট

বটে লিখে দেখা: "Gemini কত টাকা?", "Lovable আছে?", "কোন কোন AI tool আছে?", "asdfgh" (না-পাওয়া কেস), তারপর `/start`, Products, Wallet চেক করে নিশ্চিত হওয়া যে আগের সব কিছু অক্ষত।
