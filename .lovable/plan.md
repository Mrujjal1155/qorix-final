# Maintenance mode — ওয়েবসাইট আর বট আলাদা

## যা পাবেন
- Admin → Settings-এ নতুন "Maintenance mode" কার্ড, দুটো আলাদা সুইচ:
  - **Website maintenance** — চালু করলে ক্রেতারা ওয়েবসাইটের যেকোনো পেজে একটা সুন্দর "Site under maintenance" পর্দা দেখবে (ছবি + লেখা)।
  - **Bot maintenance** — চালু করলে সাধারণ user বটে কিছু চাপলে/লিখলে একটা "Bot under maintenance" বার্তা পাবে।
- দুটো সম্পূর্ণ আলাদা: একটা চালু করলে অন্যটা চলতে থাকবে।
- প্রতিটার জন্য নিজের বার্তা লেখার ঘর (খালি রাখলে ডিফল্ট লেখা)।
- Website-এর জন্য ছবি: একটা সুন্দর ছবি তৈরি করে দেব ("Site under maintenance" লেখাসহ), আর চাইলে admin নিজে অন্য ছবি upload করতে পারবেন।

## কারা আটকাবে না
- Admin পেজ (/admin) সবসময় খোলা থাকবে, যাতে আপনি সুইচ বন্ধ করতে পারেন।
- Admin হিসেবে লগইন থাকলে ওয়েবসাইট স্বাভাবিকভাবে দেখবেন (উপরে ছোট একটা "Maintenance চালু" চিহ্নসহ)।
- বটে admin-রা বট স্বাভাবিকভাবে ব্যবহার করতে পারবেন।
- পেমেন্ট ফেরত আসার লিংক, supplier webhook, Telegram webhook, reseller API — এগুলো চলতেই থাকবে, যাতে চলমান অর্ডার বা পেমেন্ট আটকে না যায়।

## শেষে
- সব বদলের পর পুরো কোড আবার মিলিয়ে ত্রুটি খুঁজে দেখব, আর ব্রাউজারে maintenance পর্দাটা দেখে নেব।

## Technical details
- Keys in existing site content store: `site_maintenance` ("on"/""), `site_maintenance_message`, `site_maintenance_image`. Bot: `bot_settings` keys `bot_maintenance`, `bot_maintenance_message`.
- Website gate: component in `__root.tsx` using `useSiteContent`; skips `/admin*`, `/auth`; bypass when user has admin role (existing role check).
- Bot gate: early in Telegram update handler in `engine.server.ts`, after admin check, reply once per message/callback (answerCallbackQuery for buttons).
- Image generated to `src/assets/maintenance.jpg`; upload via existing `ImageUploadField`.
