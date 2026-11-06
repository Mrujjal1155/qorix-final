/** Single source for the public Telegram bot identity used across pages and JSON-LD. */
export const BOT_HANDLE = "@QORIX3_bot";
export const BOT_URL = "https://t.me/QORIX3_bot";
export const BOT_PAGE_PATH = "/telegram-bot";

/** Commands the bot actually answers (see the bot's /help text). */
export const BOT_COMMANDS: Array<[string, string]> = [
  ["/start", "Open the main menu"],
  ["/products", "Browse the shop catalogue"],
  ["/wallet", "See your balance and add funds"],
  ["/support", "Contact support"],
  ["/api", "Reseller / developer API details"],
  ["/help", "Show the command guide"],
];

/** Bot questions shown on /faq (always visible, so they also feed the FAQ JSON-LD). */
export const BOT_FAQ: Array<{ title: string; text: string }> = [
  {
    title: "Is there a QORIX Telegram bot?",
    text: `Yes. Our official shop bot is ${BOT_HANDLE} (${BOT_URL}). Open it in Telegram, tap Start, and you can browse the catalogue, pay and receive your order inside the chat.`,
  },
  {
    title: "How do I pay in the Telegram bot?",
    text: "Add funds to your bot wallet or pay for an order with the methods enabled in the bot, such as Binance Pay and USDT. The wallet balance is then used to buy products.",
  },
  {
    title: "Where do I get my order in the Telegram bot?",
    text: "Automatic products are sent to you in the bot chat after payment is verified; larger deliveries come as a .txt file. You can also see past orders from the bot menu and on the Track Order page.",
  },
];
