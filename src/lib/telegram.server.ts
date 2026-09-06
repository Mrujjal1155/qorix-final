// Server-only Telegram API helper.
// Uses the Lovable connector gateway when TELEGRAM_API_KEY is configured,
// otherwise falls back to a direct bot token (TELEGRAM_BOT_TOKEN).

export type TgResult = { ok: boolean; result?: any; description?: string };

/**
 * True when Telegram rejected a message that contained a Premium custom emoji
 * and we had to resend it with plain glyphs. Only bots that own a Fragment
 * username may send custom emoji, so this tells the admin why their Premium
 * icon is stored but still displayed as a normal emoji.
 */
let customEmojiBlocked = false;
export function isCustomEmojiBlocked() {
  return customEmojiBlocked;
}


export async function tg(method: string, body: Record<string, unknown> = {}): Promise<TgResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const connKey = process.env["TELEGRAM_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  let url: string;

  // A direct bot token always wins: self-hosted deploys (Cloudflare) have no
  // Lovable gateway credentials.
  if (token) {
    url = `https://api.telegram.org/bot${token}/${method}`;
  } else if (connKey) {
    if (!lovableKey) throw new Error("Telegram connector is linked, but LOVABLE_API_KEY is missing");
    const gatewayBaseUrl = (process.env["CONNECTOR_GATEWAY_BASE_URL"] ?? "https://connector-gateway.lovable.dev").replace(
      /\/$/,
      "",
    );
    url = `${gatewayBaseUrl}/telegram/${method}`;
    headers["Authorization"] = `Bearer ${lovableKey}`;
    headers["X-Connection-Api-Key"] = connKey;
  } else {
    throw new Error("Telegram credentials missing (connect Telegram or add TELEGRAM_BOT_TOKEN)");
  }

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as TgResult;
    return { res, json };
  };

  let { res, json } = await post(body);

  // Telegram returns retry_after on flood control. Honour it once so a burst
  // of stock cards is not falsely marked failed and retried as a duplicate.
  if (res.status === 429 || (json as any)?.error_code === 429) {
    const retryAfter = Math.max(1, Math.min(30, Number((json as any)?.parameters?.retry_after ?? 1)));
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000));
    const retry = await post(body);
    res = retry.res;
    json = retry.json;
  }

  // Only strip the Premium icons when Telegram explicitly complains about the
  // custom emoji itself. Any other error (flood, bad entity, chat problem) must
  // NOT downgrade the message — that is what made premium icons randomly show
  // up as plain emoji before.
  if ((!res.ok || json.ok === false) && hasCustomEmoji(body) && isCustomEmojiError(json)) {
    const retry = await post(stripCustomEmoji(body));
    if (retry.json?.ok) customEmojiBlocked = true;
    res = retry.res;
    json = retry.json;
  } else if (json.ok && hasCustomEmoji(body)) {
    customEmojiBlocked = false;
  }


  if (!res.ok || json.ok === false) {
    console.error(`Telegram ${method} failed [${res.status}]:`, JSON.stringify(json));
  }
  return json;
}

const TG_EMOJI_RE = /<tg-emoji[^>]*>(.*?)<\/tg-emoji>/gis;

function hasCustomEmoji(body: Record<string, unknown>): boolean {
  return ["text", "caption"].some(
    (k) => typeof body[k] === "string" && /<tg-emoji/i.test(body[k] as string),
  );
}

function isCustomEmojiError(json: TgResult): boolean {
  const d = String(json?.description ?? "").toLowerCase();
  return d.includes("custom emoji") || d.includes("custom_emoji");
}

function stripCustomEmoji(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  for (const k of ["text", "caption"]) {
    if (typeof out[k] === "string") out[k] = (out[k] as string).replace(TG_EMOJI_RE, "$1");
  }
  return out;
}


export type Button = {
  text: string;
  callback_data?: string;
  url?: string;
  icon_custom_emoji_id?: string;
};

export function sendMessage(
  chat_id: number | string,
  text: string,
  keyboard?: Button[][],
  extra: Record<string, unknown> = {},
) {
  return tg("sendMessage", {
    chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...extra,
  });
}

export function sendPhoto(
  chat_id: number | string,
  photo: string,
  caption?: string,
  keyboard?: Button[][],
) {
  return tg("sendPhoto", {
    chat_id,
    photo,
    ...(caption ? { caption, parse_mode: "HTML" } : {}),
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function sendDocument(
  chat_id: number | string,
  document: string,
  caption?: string,
  keyboard?: Button[][],
) {
  return tg("sendDocument", {
    chat_id,
    document,
    ...(caption ? { caption, parse_mode: "HTML" } : {}),
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function editMessage(
  chat_id: number | string,
  message_id: number,
  text: string,
  keyboard?: Button[][],
) {
  return tg("editMessageText", {
    chat_id,
    message_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function answerCallback(callback_query_id: string, text?: string, show_alert = false) {
  return tg("answerCallbackQuery", { callback_query_id, text, show_alert });
}

export function deleteMessage(chat_id: number | string, message_id: number) {
  return tg("deleteMessage", { chat_id, message_id });
}

export function setWebhook(url: string, secret_token: string) {
  return tg("setWebhook", {
    url,
    secret_token,
    allowed_updates: ["message", "edited_message", "callback_query"],
  });
}

export function getWebhookInfo() {
  return tg("getWebhookInfo", {});
}

export function getMe() {
  return tg("getMe", {});
}

export const COMMAND_LIST = [
  { command: "start", description: "Open the home menu" },
  { command: "menu", description: "Back to the main menu" },
  { command: "shop", description: "Browse the shop" },
  { command: "flash", description: "Flash deals & discounts" },
  { command: "cart", description: "View your cart" },
  { command: "checkout", description: "Checkout and pay" },
  { command: "orders", description: "View your orders" },
  { command: "wallet", description: "Wallet & balance" },
  { command: "deposit", description: "Add funds to your wallet" },
  { command: "redeem", description: "Redeem a gift code" },
  { command: "referral", description: "Referral store & your link" },
  { command: "freebies", description: "Free stuff & giveaways" },
  { command: "emails", description: "Emails & trials" },
  { command: "api", description: "Reseller API info" },
  { command: "profile", description: "View your profile" },
  { command: "support", description: "Contact support" },
  { command: "help", description: "Show all commands" },
] as const;

export const ADMIN_COMMAND_LIST = [
  { command: "admin", description: "Admin control panel" },
] as const;

export async function setMyCommands(adminChatIds: (string | number)[] = []) {
  const base = COMMAND_LIST.map((c) => ({ command: c.command, description: c.description }));

  // Public/default scope: no admin commands here.
  const res = await tg("setMyCommands", { commands: base, scope: { type: "default" } });

  // Admin-only scope: visible solely inside each admin's private chat.
  for (const id of adminChatIds) {
    await tg("setMyCommands", {
      commands: [...base, ...ADMIN_COMMAND_LIST.map((c) => ({ ...c }))],
      scope: { type: "chat", chat_id: Number(id) },
    });
  }

  return res;
}


