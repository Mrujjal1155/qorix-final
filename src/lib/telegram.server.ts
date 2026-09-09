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

  // Broken HTML (a stray "<", an unsupported tag, a bad custom-emoji entity)
  // must never make a view vanish. Downgrade progressively instead of failing:
  // strip custom emoji first, then drop HTML entirely.
  if ((!res.ok || json.ok === false) && isParseError(json) && hasMarkupText(body)) {
    if (hasCustomEmoji(body)) {
      const retry = await post(stripCustomEmoji(body));
      res = retry.res;
      json = retry.json;
    }
    if (!res.ok || json.ok === false) {
      const retry = await post(toPlainText(body));
      res = retry.res;
      json = retry.json;
    }
  }

  // Keyboard-level rejections (unknown button style on an older Bot API,
  // invalid button icon) must not swallow the whole view either.
  if ((!res.ok || json.ok === false) && isButtonError(json) && buttonRows(body)) {
    const retry = await post(plainButtons(body));
    res = retry.res;
    json = retry.json;
  }


  if (!res.ok || json.ok === false) {
    console.error(`Telegram ${method} failed [${res.status}]:`, JSON.stringify(json));
  }
  return json;
}

const TG_EMOJI_RE = /<tg-emoji[^>]*>(.*?)<\/tg-emoji>/gis;

function buttonRows(body: Record<string, unknown>): any[][] | null {
  const rows = (body as any)?.reply_markup?.inline_keyboard;
  return Array.isArray(rows) ? rows : null;
}

function hasCustomEmoji(body: Record<string, unknown>): boolean {
  if (
    ["text", "caption"].some((k) => typeof body[k] === "string" && /<tg-emoji/i.test(body[k] as string))
  ) {
    return true;
  }
  const rows = buttonRows(body);
  return !!rows?.some((row) => row?.some?.((b: any) => b?.icon_custom_emoji_id));
}

function isCustomEmojiError(json: TgResult): boolean {
  const d = String(json?.description ?? "").toLowerCase();
  return d.includes("custom emoji") || d.includes("custom_emoji") || d.includes("icon_custom_emoji");
}

function stripCustomEmoji(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  for (const k of ["text", "caption"]) {
    if (typeof out[k] === "string") out[k] = (out[k] as string).replace(TG_EMOJI_RE, "$1");
  }
  const rows = buttonRows(out);
  if (rows) {
    out["reply_markup"] = {
      ...(out["reply_markup"] as any),
      inline_keyboard: rows.map((row) =>
        (row ?? []).map((b: any) => {
          if (!b?.icon_custom_emoji_id) return b;
          const { icon_custom_emoji_id: _drop, ...rest } = b;
          return rest;
        }),
      ),
    };
  }
  return out;
}


function hasMarkupText(body: Record<string, unknown>): boolean {
  return ["text", "caption"].some((k) => typeof body[k] === "string" && (body[k] as string).length > 0);
}

/** Telegram rejected the HTML markup itself. */
function isParseError(json: TgResult): boolean {
  const d = String(json?.description ?? "").toLowerCase();
  return (
    d.includes("can't parse entities") ||
    d.includes("cant parse entities") ||
    d.includes("unsupported start tag") ||
    d.includes("unclosed start tag") ||
    d.includes("can't find end tag") ||
    d.includes("entity")
  );
}

/** Last-resort payload: no HTML at all, so the view always reaches the user. */
function toPlainText(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  delete out["parse_mode"];
  for (const k of ["text", "caption"]) {
    if (typeof out[k] === "string") {
      out[k] = (out[k] as string)
        .replace(TG_EMOJI_RE, "$1")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    }
  }
  return out;
}



export type ButtonStyle = "primary" | "success" | "danger";

export type Button = {
  text: string;
  callback_data?: string;
  url?: string;
  icon_custom_emoji_id?: string;
  /** Bot API 10+: "primary" (blue), "success" (green), "danger" (red). */
  style?: ButtonStyle;
};

/** Apply a native Telegram button style to every button in the rows. */
export function styleRows(rows: Button[][], style: ButtonStyle): Button[][] {
  return rows.map((row) => row.map((b) => ({ ...b, style })));
}

export function styled(button: Button, style: ButtonStyle): Button {
  return { ...button, style };
}

/**
 * Every menu / navigation button is green by default. Buttons that already
 * declare a style (e.g. product rows = primary/blue) keep their own style.
 */
function withDefaultStyle(rows: Button[][]): Button[][] {
  return rows.map((row) => row.map((b) => (b.style ? b : { ...b, style: "success" as ButtonStyle })));
}

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
    ...(keyboard ? { reply_markup: { inline_keyboard: withDefaultStyle(keyboard) } } : {}),
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
    ...(keyboard ? { reply_markup: { inline_keyboard: withDefaultStyle(keyboard) } } : {}),
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
    ...(keyboard ? { reply_markup: { inline_keyboard: withDefaultStyle(keyboard) } } : {}),
  });
}

/**
 * Upload a real file to Telegram (multipart) so the user gets a tappable
 * document instead of a visible download link. Needs a direct bot token.
 */
export async function sendDocumentUpload(
  chat_id: number | string,
  filename: string,
  content: string,
  caption?: string,
  keyboard?: Button[][],
): Promise<TgResult> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return { ok: false, description: "no bot token for file upload" };

  const send = async (cap?: string) => {
    const form = new FormData();
    form.append("chat_id", String(chat_id));
    form.append("document", new Blob([content], { type: "text/plain" }), filename);
    if (cap) {
      form.append("caption", cap);
      form.append("parse_mode", "HTML");
    }
    if (keyboard) form.append("reply_markup", JSON.stringify({ inline_keyboard: withDefaultStyle(keyboard) }));
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
    });
    return (await res.json().catch(() => ({ ok: false }))) as TgResult;
  };

  let json = await send(caption);
  if (json.ok === false && caption && /<tg-emoji/i.test(caption) && isCustomEmojiError(json)) {
    json = await send(caption.replace(TG_EMOJI_RE, "$1"));
  }
  if (json.ok === false) console.error("Telegram sendDocument (upload) failed:", JSON.stringify(json));
  return json;
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
    ...(keyboard ? { reply_markup: { inline_keyboard: withDefaultStyle(keyboard) } } : {}),
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
  { command: "start", description: "Start and open the menu" },
  { command: "menu", description: "Open the main menu" },
  { command: "products", description: "Show products" },
  { command: "wallet", description: "Open wallet" },
  { command: "api", description: "Open API access" },
  { command: "support", description: "Open support" },
] as const;

export const ADMIN_COMMAND_LIST = [
  { command: "admin", description: "Admin control panel" },
] as const;

export async function setMyCommands(adminChatIds: (string | number)[] = []) {
  const base = COMMAND_LIST.map((c) => ({ command: c.command, description: c.description }));

  // Public/default scope: no admin commands here.
  const res = await tg("setMyCommands", { commands: base, scope: { type: "default" } });

  // Wipe stale lists left in other scopes by older versions, then re-apply
  // the trimmed list so private chats never show removed commands.
  for (const scope of [{ type: "all_private_chats" }, { type: "all_group_chats" }, { type: "all_chat_administrators" }]) {
    await tg("deleteMyCommands", { scope }).catch(() => {});
    await tg("setMyCommands", { commands: base, scope }).catch(() => {});
  }

  // Admin-only scope: visible solely inside each admin's private chat.
  for (const id of adminChatIds) {
    await tg("setMyCommands", {
      commands: [...base, ...ADMIN_COMMAND_LIST.map((c) => ({ ...c }))],
      scope: { type: "chat", chat_id: Number(id) },
    });
  }

  return res;
}


