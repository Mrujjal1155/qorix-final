// Server-only Telegram shop bot engine.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  answerCallback,
  deleteMessage,
  editMessage,
  getMe,
  tg,
  isCustomEmojiBlocked,

  sendDocument,
  sendDocumentUpload,
  sendMessage,
  sendPhoto,
  COMMAND_LIST,
  styleRows,
  styled,
  type Button,
  type ButtonStyle,
} from "@/lib/telegram.server";
import {
  UI_ELEMENTS,
  UI_GROUPS,
  uiBtn,
  uiIconHtml,
  uiKeysOf,
  uiTag,
  uiText,
  uiUrlBtn,
  parseIconValue,
  mfsBtn,
  mfsIconsHtml,
  type UiKey,
} from "@/lib/bot/ui.server";

import { renderRich, plainRich } from "@/lib/bot/richtext";
import {
  credentialItems,
  orderCode,
  orderFileName,
  orderFileText,
  orderPlainText,
  signOrderToken,
} from "@/lib/order-file.server";
import { parseStock } from "@/lib/stock-format";
import { SITE_ORIGIN } from "@/lib/site-url";


const db = supabaseAdmin as any;

/* ------------------------------------------------------------------ utils */

export function money(n: number | string | null | undefined) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

export function maskUsername(u?: string | null, first?: string | null) {
  const base = (u || first || "User").replace(/^@/, "");
  return base.slice(0, 1).toUpperCase() + "*****";
}

function membershipFor(totalSpent: number) {
  if (totalSpent >= 500) return "Diamond";
  if (totalSpent >= 200) return "Platinum";
  if (totalSpent >= 50) return "Gold";
  if (totalSpent >= 10) return "Silver";
  return "Bronze";
}

function refCode() {
  return "REF" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

const MENU_ICONS = {
  shop: ["🛒", "SHOP"], cart: ["🧺", "Cart"], orders: ["📦", "Orders"],
  wallet: ["💰", "Wallet"], freebies: ["🎁", "Freebies"], profile: ["👤", "Profile"],
  referral: ["🏪", "Referral Store"], support: ["🆘", "Support"], emails: ["📧", "Emails & Trials"],
  api: ["🔌", "Reseller API"], clear: ["🧹", "Clear Chat"], refresh: ["🔄", "Refresh Stock"],
  back: ["◀️", "Main Menu"],
} as const;

type MenuIconKey = keyof typeof MENU_ICONS;

const DEFAULT_EMAILS_LINK = "https://mailreader.lovable.app/";

function menuButtonText(settings: Record<string, string>, key: MenuIconKey, label?: string) {
  const [fallback, defaultLabel] = MENU_ICONS[key];
  const { customId, glyph } = parseIconValue(settings[`menu_icon_${key}`] ?? "", fallback);
  return {
    text: `${glyph} ${label ?? defaultLabel}`.replace(/\s+/g, " ").trim(),
    customId,
  };
}

function iconUrlButton(settings: Record<string, string>, key: MenuIconKey, url: string, label?: string): Button {
  const { text, customId } = menuButtonText(settings, key, label);
  return {
    text: customId ? (label ?? MENU_ICONS[key][1]) : text,
    url,
    ...(customId ? { icon_custom_emoji_id: customId } : {}),
  };
}

function iconButton(settings: Record<string, string>, key: MenuIconKey, callback_data: string, label?: string): Button {
  const { text, customId } = menuButtonText(settings, key, label);
  return {
    text: customId ? (label ?? MENU_ICONS[key][1]) : text,
    callback_data,
    ...(customId ? { icon_custom_emoji_id: customId } : {}),
    ...(key === "back" ? { style: "danger" as const } : {}),
  };
}


/** Page header icons — admin can replace each with a Premium custom emoji. */
const PAGE_ICONS = {
  home: ["🏠", "Home page"],
  shop: ["🛍", "Shop page"],
  product: ["📦", "Product page"],
  checkout: ["🧾", "Checkout page"],
  payment: ["💳", "Payment page"],
  wallet: ["💰", "Wallet page"],
  orders: ["📬", "Orders page"],
  cart: ["🧺", "Cart page"],
  profile: ["👤", "Profile page"],
} as const;

type PageIconKey = keyof typeof PAGE_ICONS;

/** HTML for a page header icon (Premium custom emoji when configured). */
export function pageIconHtml(settings: Record<string, string>, key: PageIconKey) {
  const [fallback] = PAGE_ICONS[key];
  const parsed = parseIconValue(settings[`page_icon_${key}`] ?? "", fallback);
  const glyph = escapeHtml(parsed.glyph);
  return parsed.customId ? `<tg-emoji emoji-id="${parsed.customId}">${glyph}</tg-emoji>` : glyph;
}

/**
 * Section headers — the big "P R O D U C T S" / "W A L L E T" style title on
 * top of every bot page. Admins can replace each one with a line built from
 * Telegram Premium custom emoji (letter emoji), sent straight from Bot Admin.
 * Stored under `page_head_<key>` as ready-to-send Telegram HTML.
 */
const SECTION_HEADS = {
  home: "Home / start page",
  shop: "Shop · categories",
  products: "Products list",
  cart: "Cart page",
  checkout: "Checkout page",
  wallet: "Wallet page",
  orders: "My orders page",
  profile: "Profile page",
  referral: "Referral page",
  refstore: "Refer & Earn (rewards) page",
  support: "Support page",
  api: "Reseller API page",
} as const;

type SectionHeadKey = keyof typeof SECTION_HEADS;

/** Admin header line when configured, otherwise the built-in header. */
function sectionHead(settings: Record<string, string>, key: SectionHeadKey, fallbackHtml: string) {
  const v = String(settings[`page_head_${key}`] ?? "").trim();
  return v || fallbackHtml;
}

/**
 * Turns an admin message into Telegram HTML, keeping every Premium custom
 * emoji it contains — that is how a whole "PRODUCTS" banner is captured.
 */
function headerHtmlFromMessage(msg: any, text: string): string {
  const raw = String(text ?? "");
  const entities: any[] = [...(msg?.entities ?? []), ...(msg?.caption_entities ?? [])]
    .filter((e: any) => e?.type === "custom_emoji" && e?.custom_emoji_id)
    .sort((a: any, b: any) => a.offset - b.offset);

  if (!raw.trim()) {
    const st = msg?.sticker;
    if (st?.custom_emoji_id) {
      return `<tg-emoji emoji-id="${st.custom_emoji_id}">${escapeHtml(String(st.emoji ?? "⭐"))}</tg-emoji>`;
    }
    return "";
  }

  let out = "";
  let pos = 0;
  for (const e of entities) {
    const offset = Number(e.offset ?? 0);
    const length = Number(e.length ?? 0);
    if (offset < pos) continue;
    out += escapeHtml(raw.slice(pos, offset));
    out += `<tg-emoji emoji-id="${e.custom_emoji_id}">${escapeHtml(raw.slice(offset, offset + length))}</tg-emoji>`;
    pos = offset + length;
  }
  out += escapeHtml(raw.slice(pos));
  return out.trim();
}

/**
 * Icons used inside the stock / price alert cards. Admin can replace every one
 * of them with a Telegram Premium custom emoji from /admin → Alert icons.
 */
const ALERT_ICONS = {
  restock: ["🔥", "Back in stock badge"],
  new: ["🆕", "New product badge"],
  low: ["🚨", "Almost gone badge"],
  out: ["⛔", "Sold out badge"],
  price_down: ["💸", "Price drop badge"],
  price_up: ["📈", "Price update badge"],
  price: ["🏷", "Price line"],
  stock: ["📦", "Stock line"],
  spark: ["⚡", "Highlight line"],
  delivery: ["⏱", "Delivery line"],
  bell: ["🔔", "Notify line"],
  save: ["💰", "You save line"],
} as const;

type AlertIconKey = keyof typeof ALERT_ICONS;

/** HTML for an alert icon (Premium custom emoji when configured). */
function alertIcon(settings: Record<string, string>, key: AlertIconKey) {
  const [fallback] = ALERT_ICONS[key];
  const parsed = parseIconValue(settings[`alert_icon_${key}`] ?? "", fallback);
  const glyph = escapeHtml(parsed.glyph);
  return parsed.customId ? `<tg-emoji emoji-id="${parsed.customId}">${glyph}</tg-emoji>` : glyph;
}

/**
 * Icons used on the in-bot Reseller API panel. Every one of them can be
 * replaced with a Telegram Premium custom emoji from /admin → API icons.
 */
const API_ICONS = {
  panel: ["🔌", "API panel header"],
  account: ["🪪", "Account line"],
  status: ["🟢", "Status line"],
  balance: ["💵", "API balance line"],
  discount: ["🏷", "Discount line"],
  orders: ["📦", "API orders line"],
  key: ["🔑", "API key line"],
  alert: ["🔔", "Low-balance alert line"],
  topup: ["💳", "Top Up API Balance button"],
  prices: ["💲", "My Prices button"],
  docs: ["📖", "API Docs button"],
  regen: ["🔄", "Regenerate Key button"],
  revoke: ["🚫", "Revoke Key button"],
} as const;

type ApiIconKey = keyof typeof API_ICONS;

/** HTML for an API panel icon (Premium custom emoji when configured). */
function apiIcon(settings: Record<string, string>, key: ApiIconKey) {
  const [fallback] = API_ICONS[key];
  const parsed = parseIconValue(settings[`api_icon_${key}`] ?? "", fallback);
  const glyph = escapeHtml(parsed.glyph);
  return parsed.customId ? `<tg-emoji emoji-id="${parsed.customId}">${glyph}</tg-emoji>` : glyph;
}

/** Button carrying an API panel icon (Premium custom emoji when configured). */
function apiBtn(
  settings: Record<string, string>,
  key: ApiIconKey,
  label: string,
  callback_data: string,
): Button {
  const [fallback] = API_ICONS[key];
  const parsed = parseIconValue(settings[`api_icon_${key}`] ?? "", fallback);
  return {
    text: parsed.customId ? label : `${parsed.glyph} ${label}`.trim(),
    callback_data,
    ...(parsed.customId ? { icon_custom_emoji_id: parsed.customId } : {}),
  };
}




/**
 * Fallback icon for products that have no icon of their own (e.g. products
 * auto-listed from a supplier API). Admin sets it from /admin → UI icons →
 * product → "Default product icon", or from the website admin.
 */
function defaultProductIcon() {
  const settings = settingsCache?.data ?? {};
  return parseIconValue(settings["ui_icon_prod_icon_default"] ?? "", "📦");
}

function productIcon(product: any) {
  const id = String(product?.telegram_custom_emoji_id ?? "").trim();
  const glyph = String(product?.emoji ?? "").trim();
  if (id) return { customId: id, glyph: glyph || "📦" };
  const fallback = defaultProductIcon();
  if (glyph && glyph !== "📦") return { customId: "", glyph };
  return { customId: fallback.customId, glyph: fallback.glyph || glyph || "📦" };
}

function productIconHtml(product: any) {
  const { customId, glyph } = productIcon(product);
  const safe = escapeHtml(glyph);
  return customId ? `<tg-emoji emoji-id="${customId}">${safe}</tg-emoji>` : safe;
}

function productIconButton(product: any, text: string, callback_data: string): Button {
  const { customId, glyph } = productIcon(product);
  return {
    text: customId ? text.trim() : `${glyph} ${text}`.trim(),
    callback_data,
    ...(customId ? { icon_custom_emoji_id: customId } : {}),
  };
}


/** Keep the glyph the admin sent next to the Premium id, so buttons show it too. */
function iconValue(customEmojiId: string, raw: string) {
  const glyph = raw.trim().slice(0, 8);
  if (!customEmojiId) return glyph.slice(0, 16);
  return glyph ? `${customEmojiId}|${glyph}` : customEmojiId;
}

function customEmojiIdFromMessage(msg: any): string {
  const entity = [...(msg?.entities ?? []), ...(msg?.caption_entities ?? [])]
    .find((item: any) => item?.type === "custom_emoji" && item?.custom_emoji_id);
  const fromEntity = String(entity?.custom_emoji_id ?? "");
  if (fromEntity) return fromEntity;
  // A Premium emoji forwarded/sent as a sticker carries the id on the sticker.
  const sticker = msg?.sticker;
  if (sticker?.custom_emoji_id) return String(sticker.custom_emoji_id);
  return "";
}

/**
 * Normalizes any way an admin can send an icon:
 * - plain emoji text
 * - Premium custom emoji inside the text (entities)
 * - Premium emoji sent as a sticker (no text at all)
 * - a pasted numeric custom-emoji id
 */
function readIconInput(msg: any, text: string, fallbackGlyph: string) {
  const raw = (text ?? "").trim();
  if (raw === "-") return { reset: true, empty: false, value: "" };
  const customId = customEmojiIdFromMessage(msg);
  const stickerGlyph = String(msg?.sticker?.emoji ?? "").trim();
  // Admin pasted only the numeric id.
  if (!customId && /^\d{8,}$/.test(raw)) {
    return { reset: false, empty: false, value: iconValue(raw, fallbackGlyph) };
  }
  const glyph = raw || stickerGlyph || (customId ? fallbackGlyph : "");
  if (!customId && !glyph) return { reset: false, empty: true, value: "" };
  return { reset: false, empty: false, value: iconValue(customId, glyph) };
}

const ICON_INPUT_HELP =
  "❌ I could not read an icon there.\n\nSend a normal emoji, a Telegram Premium custom emoji (typing it or sending it as a sticker), or its numeric emoji id. Send <code>-</code> to reset.";


/* ------------------------------------------------- perf: caches & deferral */

const SETTINGS_TTL_MS = 30_000;
let settingsCache: { at: number; data: Record<string, string> } | null = null;
let settingsInflight: Promise<Record<string, string>> | null = null;

/** Background work that must not block the Telegram reply. */
const background: Promise<unknown>[] = [];
function defer(work: Promise<unknown> | (() => Promise<unknown>)) {
  const p = typeof work === "function" ? work() : work;
  background.push(Promise.resolve(p).catch(() => {}));
}
/** Awaited once, after the user-visible reply has been sent. */
export async function flushBackground() {
  while (background.length) {
    const batch = background.splice(0, background.length);
    await Promise.allSettled(batch);
  }
}

export function invalidateSettings() {
  settingsCache = null;
}

export async function getSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (settingsCache && now - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.data;
  if (settingsInflight) return settingsInflight;
  settingsInflight = (async () => {
    const { data } = await db.from("bot_settings").select("key,value");
    const out: Record<string, string> = {};
    for (const row of data ?? []) out[row.key] = row.value ?? "";
    settingsCache = { at: Date.now(), data: out };
    return out;
  })().finally(() => {
    settingsInflight = null;
  });
  return settingsInflight;
}

/** Admin-written note describing how a manual product should be delivered. */
async function manualNoteFor(productId: string): Promise<string> {
  const s = await getSettings();
  const note = (s[`manual_note_${productId}`] ?? "").trim();
  return note ? `\n📝 <b>Delivery note</b>\n<pre>${escapeHtml(note)}</pre>\n\n` : "\n";
}

/** Settings write that also busts the in-memory cache. Throws on failure. */
async function upsertSetting(rows: any, opts: any = { onConflict: "key" }) {
  invalidateSettings();
  const res = await db.from("bot_settings").upsert(rows, opts);
  if (res.error) {
    console.error("bot_settings upsert failed:", JSON.stringify(res.error));
    throw new Error(res.error.message || "Settings save failed");
  }
  invalidateSettings();
  return res;
}

/** Save one icon/text setting and verify it really landed in the database. */
async function saveIconSetting(key: string, value: string) {
  await upsertSetting({ key, value }, { onConflict: "key" });
  const { data, error } = await db
    .from("bot_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if ((data?.value ?? "") !== value) throw new Error("Value did not persist");
  invalidateSettings();
  return value;
}

/**
 * Telegram only lets bots that own a Fragment username render Premium custom
 * emoji. When that happens the icon is saved fine but shows as a plain emoji,
 * so tell the admin instead of leaving them guessing.
 */
async function premiumEmojiNote(chatId: number, value: string) {
  if (!parseIconValue(value, "").customId) return;
  if (!isCustomEmojiBlocked()) return;
  await sendMessage(
    chatId,
    "ℹ️ <b>Saved.</b> Telegram rejected this custom emoji in the last message, so it was shown as a normal emoji there. " +
      "Try another Premium emoji — the saved icon is used everywhere it is allowed.",
  );
}

function saveFailText(e: unknown) {

  const m = e instanceof Error ? e.message : String(e);
  return `❌ Could not save the icon.\n<code>${escapeHtml(m)}</code>`;
}

/** Preview of a stored icon value (Premium custom emoji aware). */
function iconPreviewHtml(value: string, fallback: string) {
  const { customId, glyph } = parseIconValue(value, fallback);
  return customId
    ? `<tg-emoji emoji-id="${customId}">${escapeHtml(glyph)}</tg-emoji>`
    : escapeHtml(glyph);
}

/**
 * Live list of stored icons rendered inside the message text. Inline buttons
 * cannot render Premium custom emoji, so the text block is the only place the
 * admin can actually see the Premium icon that was just saved.
 */
function iconPreviewLines(
  settings: Record<string, string>,
  prefix: string,
  entries: [string, string, string][],
) {
  return entries
    .map(([key, label, fallback]) => {
      const raw = settings[`${prefix}${key}`] ?? "";
      const { customId } = parseIconValue(raw, fallback);
      return `${iconPreviewHtml(raw, fallback)} ${escapeHtml(label)}${customId ? " · ✨" : ""}`;
    })
    .join("\n");
}




/** Locally tracked message ids per user, so tracking needs no extra SELECT. */
const msgsCache = new Map<number, number[]>();
/** Latest state we wrote in this isolate — protects against stale read-modify-write. */
const stateCache = new Map<number, Record<string, unknown>>();

async function setState(telegramId: number, state: Record<string, unknown> | null) {
  const next = (state ?? {}) as Record<string, unknown>;
  const msgs = (next as any)?.msgs;
  if (Array.isArray(msgs)) msgsCache.set(telegramId, msgs.slice(-40));
  stateCache.set(telegramId, next);
  await db.from("bot_users").update({ state: next }).eq("telegram_id", telegramId);
}

async function trackMessage(telegramId: number, messageId?: number) {
  if (!messageId) return;
  let msgs = msgsCache.get(telegramId);
  if (!msgs) {
    const { data } = await db
      .from("bot_users")
      .select("state")
      .eq("telegram_id", telegramId)
      .maybeSingle();
    const state = (data?.state ?? {}) as any;
    msgs = Array.isArray(state.msgs) ? state.msgs : [];
  }
  msgs = [...(msgs ?? []), messageId].slice(-40);
  msgsCache.set(telegramId, msgs);
  const { data } = await db
    .from("bot_users")
    .select("state")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  const dbState = (data?.state ?? {}) as any;
  // Never let this background write roll back a newer state (e.g. `awaiting`).
  const state = { ...dbState, ...(stateCache.get(telegramId) ?? {}) } as any;
  state.msgs = msgs;
  stateCache.set(telegramId, state);
  await db.from("bot_users").update({ state }).eq("telegram_id", telegramId);
}


async function say(chatId: number, text: string, kb?: Button[][]) {
  const res = await sendMessage(chatId, text, kb);
  // Message-id bookkeeping is not user-visible → never block the reply on it.
  defer(() => trackMessage(chatId, res?.result?.message_id));
  return res;
}

function adminIds(s: Record<string, string>) {
  return `${s["admin_telegram_ids"] || ""},${s["admin_ids"] || ""}`
    .split(/[,\s]+/)
    .filter(Boolean);
}

function adminUsernames(s: Record<string, string>) {
  return `${s["admin_usernames"] || ""}`
    .split(/[,\s]+/)
    .map((u) => u.replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

async function isAdmin(telegramId: number, settings?: Record<string, string>) {
  const s = settings ?? (await getSettings());
  if (adminIds(s).includes(String(telegramId))) return true;

  const names = adminUsernames(s);
  if (!names.length) return false;
  const { data } = await db
    .from("bot_users")
    .select("username")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  const uname = (data?.username || "").replace(/^@/, "").toLowerCase();
  return Boolean(uname) && names.includes(uname);
}


async function notifyAdmins(text: string, kb?: Button[][]) {
  const s = await getSettings();
  for (const id of adminIds(s)) await sendMessage(id, text, kb);
}

const CAPTION_LIMIT = 1024;

const DEFAULT_SITE_URL = SITE_ORIGIN;

function siteUrl(settings: Record<string, string>) {
  const raw = (settings["site_url"] || process.env["SITE_URL"] || DEFAULT_SITE_URL).trim();
  return raw.replace(/\/+$/, "");
}

/**
 * Telegram accepts an https URL or a file_id, never a data: URL. Inline images
 * are served through our own public endpoint instead.
 */
function bannerFor(product: any, settings: Record<string, string>): string | null {
  const raw = String(product?.image_url ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("data:")) return `${siteUrl(settings)}/api/public/product-image/${product.id}`;
  return /\s/.test(raw) ? null : raw; // Telegram file_id
}

/**
 * Replace a text message in place. Telegram refuses editMessageText on media
 * messages (photo banners), so those are deleted and re-sent as text — this is
 * what keeps buttons under a product banner responsive.
 */
export async function renderText(
  chatId: number,
  messageId: number | undefined,
  text: string,
  kb?: Button[][],
  fromMedia = false,
) {
  if (messageId && !fromMedia) {
    const res = await editMessage(chatId, messageId, text, kb);
    if (res?.ok !== false) return;
    if (/not modified/i.test(res.description ?? "")) return;
  }
  // Send first, delete after: if the new message fails the user keeps the old
  // view instead of an empty chat.
  const sent = await say(chatId, text, kb);
  if (sent?.ok === false) return;
  if (messageId) await deleteMessage(chatId, messageId).catch(() => undefined);
}

/**
 * Render a view that may carry a banner image. Photo messages cannot be turned
 * into text messages (and vice-versa), so the old message is replaced.
 */
async function showView(
  chatId: number,
  messageId: number | undefined,
  view: { text: string; kb?: Button[][]; photo?: string | null },
  fromMedia = false,
) {
  if (!view.photo) {
    await renderText(chatId, messageId, view.text, view.kb, fromMedia);
    return;
  }

  const short = view.text.length <= CAPTION_LIMIT;
  const res = await sendPhoto(
    chatId,
    view.photo,
    short ? view.text : undefined,
    short ? view.kb : undefined,
  );

  if (!res.ok) {
    // Telegram could not fetch the banner — never lose the product details.
    const sent = await say(chatId, view.text, view.kb);
    if (sent?.ok !== false && messageId) {
      await deleteMessage(chatId, messageId).catch(() => undefined);
    }
    return;
  }
  if (messageId) await deleteMessage(chatId, messageId).catch(() => undefined);
  await trackMessage(chatId, res?.result?.message_id);
  if (!short) await say(chatId, view.text, view.kb);
}


/* ------------------------------------------------------------------- user */

export async function upsertUser(from: any, startPayload?: string) {
  const telegram_id = from.id as number;
  const { data: existing } = await db
    .from("bot_users")
    .select("*")
    .eq("telegram_id", telegram_id)
    .maybeSingle();

  if (existing) {
    const changed =
      (from.username ?? null) !== (existing.username ?? null) ||
      (from.first_name ?? null) !== (existing.first_name ?? null) ||
      (from.last_name ?? null) !== (existing.last_name ?? null);
    // Profile refresh is invisible to the user → run it in the background.
    if (changed) {
      defer(() =>
        db
          .from("bot_users")
          .update({
            username: from.username ?? existing.username,
            first_name: from.first_name ?? existing.first_name,
            last_name: from.last_name ?? existing.last_name,
          })
          .eq("telegram_id", telegram_id),
      );
    }
    return { ...existing, username: from.username ?? existing.username };
  }

  let referred_by: number | null = null;
  if (startPayload && startPayload.startsWith("ref_")) {
    const code = startPayload.slice(4);
    const { data: ref } = await db
      .from("bot_users")
      .select("telegram_id")
      .eq("ref_code", code)
      .maybeSingle();
    if (ref && ref.telegram_id !== telegram_id) referred_by = ref.telegram_id;
  }

  const { data: created, error: insertError } = await db
    .from("bot_users")
    .insert({
      telegram_id,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      last_name: from.last_name ?? null,
      ref_code: refCode(),
      referred_by,
    })
    .select("*")
    .maybeSingle();
  if (insertError) {
    console.error("User creation failed:", JSON.stringify(insertError));
    throw new Error(`User registration failed: ${insertError.message}`);
  }

  if (referred_by) {
    const { data: r } = await db
      .from("bot_users")
      .select("referral_count")
      .eq("telegram_id", referred_by)
      .maybeSingle();
    await db
      .from("bot_users")
      .update({ referral_count: Number(r?.referral_count ?? 0) + 1 })
      .eq("telegram_id", referred_by);
  }
  return created;
}

async function getUser(telegramId: number) {
  const { data } = await db.from("bot_users").select("*").eq("telegram_id", telegramId).maybeSingle();
  return data;
}

/* ------------------------------------------------------------------ views */

function homeKeyboard(settings: Record<string, string>): Button[][] {
  const mBtn = (b: Button) => styled(b, btnColor(settings, "menu"));
  return [
    [
      mBtn(iconButton(settings, "shop", "shop:0")),
      mBtn(iconButton(settings, "cart", "cart")),
      mBtn(iconButton(settings, "orders", "orders")),
    ],


    [
      mBtn(iconButton(settings, "wallet", "wallet")),
      mBtn(iconButton(settings, "freebies", "freebies")),
      mBtn(iconButton(settings, "profile", "profile")),
    ],
    [iconButton(settings, "referral", "refstore")],
    [
      iconButton(settings, "support", "support"),
      iconUrlButton(
        settings,
        "emails",
        (settings["emails_trials_link"] || "").trim() || DEFAULT_EMAILS_LINK,
      ),
    ],
    [
      iconButton(settings, "api", "api"),
      iconButton(settings, "clear", "clear"),
    ],
  ];
}

async function homeText(user: any) {
  const s = await getSettings();
  const botName = (s["bot_name"] || "SHOP").toUpperCase().split("").join(" ");
  const link = `https://t.me/${s["bot_username"] || "your_bot"}?start=ref_${user.ref_code}`;
  return (
    `${sectionHead(s, "home", `<b>${botName}</b>`)}\n\n` +
    `${uiIconHtml(s, "home_greet")} ${uiText(s, "home_greet")}, <b>${escapeHtml(user.first_name ?? "friend")}</b>!\n` +
    `<i>${s["welcome_text"] ?? ""}</i>\n` +
    `──────────────\n` +
    `${uiTag(s, "prof_username")}: ${user.username ? "@" + escapeHtml(user.username) : "—"}\n` +
    `${uiTag(s, "prof_userid")}: <code>${user.telegram_id}</code>\n` +
    `${uiTag(s, "prof_member")}: ${escapeHtml(String(user.membership ?? ""))}\n` +
    `${uiTag(s, "prof_balance")}: ${money(user.balance)}\n` +
    `${uiTag(s, "prof_spent")}: ${money(user.total_spent)}\n` +
    `${uiTag(s, "prof_refs")}: ${user.referral_count}\n` +
    `${uiTag(s, "prof_earning")}: ${money(user.referral_earnings)}\n` +
    `${uiTag(s, "prof_link")}: ${link}\n` +
    `──────────────\n\n` +
    `${uiText(s, "home_choose")}`
  );
}

/* --------------------------------------------------- profile & referrals */

const TIERS = [
  { name: "Bronze", key: "tier_bronze" as UiKey, min: 0, discount: 0, priority: false, perk: "welcome tier" },
  { name: "Silver", key: "tier_silver" as UiKey, min: 10, discount: 1, priority: true, perk: "priority support" },
  { name: "Gold", key: "tier_gold" as UiKey, min: 50, discount: 2, priority: true, perk: "early access to flash deals" },
  { name: "Platinum", key: "tier_platinum" as UiKey, min: 200, discount: 4, priority: true, perk: "VIP support + bonus drops" },
  { name: "Diamond", key: "tier_diamond" as UiKey, min: 500, discount: 5, priority: true, perk: "top tier — best perks" },
];


function tierInfo(totalSpent: number) {
  const spent = Number(totalSpent || 0);
  const idx = Math.max(0, TIERS.findIndex((t, i) => spent >= t.min && (!TIERS[i + 1] || spent < TIERS[i + 1]!.min)));
  const current = TIERS[idx]!;
  const next = TIERS[idx + 1];
  return { current, next, spent, remaining: next ? Math.max(0, next.min - spent) : 0 };
}

function refLink(settings: Record<string, string>, user: any) {
  return `https://t.me/${settings["bot_username"] || "your_bot"}?start=ref_${user.ref_code}`;
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function profileView(chatId: number, user: any) {
  const s = await getSettings();
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("telegram_id", chatId);
  const { current, next, remaining } = tierInfo(user.total_spent);
  const link = refLink(s, user);

  const text =
    `${sectionHead(s, "profile", `<b>${escapeHtml(uiText(s, "prof_title").toUpperCase().split("").join(" "))}</b>`)}\n` +
    `──────────────\n` +
    `${uiTag(s, "prof_username")}: ${user.username ? "@" + escapeHtml(user.username) : "—"}\n` +
    `${uiTag(s, "prof_userid")}: <code>${user.telegram_id}</code>\n` +
    `${uiTag(s, "prof_member")}: <b>${escapeHtml(current.name)}</b> <i>(${escapeHtml(current.perk)})</i>\n` +
    `${uiTag(s, "prof_balance")}: <b>${money(user.balance)}</b>\n` +
    `${uiTag(s, "prof_spent")}: ${money(user.total_spent)}\n` +
    `📦 Orders: <b>${count ?? 0}</b>\n` +
    `${uiTag(s, "prof_refs")}: ${user.referral_count ?? 0}\n` +
    `${uiTag(s, "prof_earning")}: ${money(user.referral_earnings)}\n` +
    `${uiTag(s, "prof_link")}: <code>${escapeHtml(link)}</code>\n` +
    `──────────────\n` +
    (next
      ? `${uiTag(s, "tier_next")}: <b>${escapeHtml(next.name)}</b> — spend ${money(remaining)} more\n`
      : `${uiTag(s, "tier_current")}: highest tier reached 🎉\n`) +
    `${uiTag(s, "prof_since")} ${fmtDate(user.created_at)}`;

  const kb: Button[][] = [
    [uiBtn(s, "prof_orders_btn", "orders"), uiBtn(s, "prof_refer_btn", "refstore")],
    [uiUrlBtn(s, "prof_share_btn", shareUrl(s, user))],
    [uiBtn(s, "prof_tiers_btn", "tiers")],
    [uiBtn(s, "prof_back_btn", "home")],
  ];
  return { text, kb };
}

function shareUrl(settings: Record<string, string>, user: any) {
  const link = refLink(settings, user);
  const msg = settings["referral_share_text"] || `Join ${settings["bot_name"] || "our shop"} and grab the best deals!`;
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(msg)}`;
}

async function referralView(user: any) {
  const s = await getSettings();
  const pct = Number(s["referral_percent"] || 0);
  const link = refLink(s, user);
  const text =
    `${sectionHead(s, "referral", `<b>${escapeHtml(uiText(s, "ref_title").toUpperCase().split("").join(" "))}</b>`)}\n` +
    `──────────────\n` +
    `${uiTag(s, "ref_rate")}: you earn <b>${pct}%</b> of every purchase your friends make — credited to your balance instantly.\n\n` +
    `${uiTag(s, "prof_refs")}: <b>${user.referral_count ?? 0}</b>\n` +
    `${uiTag(s, "prof_earning")}: <b>${money(user.referral_earnings)}</b>\n\n` +
    `${uiTag(s, "prof_link")}\n<code>${escapeHtml(link)}</code>\n` +
    `<i>Tap the link to copy, or use the share button below.</i>`;
  const kb: Button[][] = [
    [uiUrlBtn(s, "ref_share_btn", shareUrl(s, user))],
    [uiBtn(s, "ref_list_btn", "ref:list"), uiBtn(s, "prof_tiers_btn", "tiers")],
    [styled(uiBtn(s, "ref_profile_btn", "profile"), "danger")],
  ];
  return { text, kb };
}

async function referralListView(user: any) {
  const s = await getSettings();
  const { data: rows } = await db
    .from("bot_users")
    .select("username,first_name,total_spent,created_at")
    .eq("referred_by", user.telegram_id)
    .order("created_at", { ascending: false })
    .limit(20);
  const pct = Number(s["referral_percent"] || 0);
  const list = (rows ?? []).length
    ? (rows ?? [])
        .map(
          (r: any, i: number) =>
            `${i + 1}. <b>${escapeHtml(maskUsername(r.username, r.first_name))}</b> — spent ${money(
              r.total_spent,
            )} → earned you ${money((Number(r.total_spent || 0) * pct) / 100)} <i>(${fmtDate(r.created_at)})</i>`,
        )
        .join("\n")
    : "No referrals yet — share your link to start earning.";
  const text =
    `<b>M Y   R E F E R R A L S</b>\n──────────────\n${list}\n──────────────\n` +
    `${uiTag(s, "prof_earning")}: <b>${money(user.referral_earnings)}</b>`;
  const kb: Button[][] = [
    [uiUrlBtn(s, "ref_share_btn", shareUrl(s, user))],
    [styled(uiBtn(s, "ref_profile_btn", "profile"), "danger")],
  ];
  return { text, kb };
}

async function tiersView(user: any) {
  const s = await getSettings();
  const { current, next, remaining, spent } = tierInfo(user.total_spent);
  const ladder = TIERS.map((t) => {
    const you = t.name === current.name;
    const head = `${you ? uiIconHtml(s, "tier_you") + " " : ""}${uiIconHtml(s, t.key)} <b>${escapeHtml(
      uiText(s, t.key) || t.name,
    )}</b>${you ? ` <i>${escapeHtml(uiText(s, "tier_you"))}</i>` : ""}`;
    const rows = [
      `   ${uiTag(s, "tier_from")}   <b>${money(t.min)}</b>`,
      `   ${uiTag(s, "tier_discount")}   <b>${t.discount}%</b>`,
    ];
    if (t.priority) rows.push(`   ${uiIconHtml(s, "tier_priority")} <i>${escapeHtml(uiText(s, "tier_priority"))}</i>`);
    return `${head}\n${rows.join("\n")}`;
  }).join("\n\n");

  const text =
    `<b>${escapeHtml(uiText(s, "tier_title").toUpperCase().split("").join(" "))}</b>\n` +
    `──────────────\n` +
    `${uiTag(s, "tier_spend")}  <b>${money(spent)}</b>\n\n` +
    `${ladder}\n` +
    `──────────────\n` +
    (next
      ? `${uiIconHtml(s, "tier_progress")} ${escapeHtml(uiText(s, "tier_progress"))} <b>${money(
          remaining,
        )}</b> more to reach ${uiIconHtml(s, next.key)} <b>${escapeHtml(uiText(s, next.key) || next.name)}</b>`
      : `${uiIconHtml(s, "tier_progress")} You are at the highest tier 🎉`);

  const kb: Button[][] = [
    [uiBtn(s, "prof_refer_btn", "refstore")],
    [uiBtn(s, "tier_back", "profile")],
  ];
  return { text, kb };
}


/* -------------------------------------------------------------- support */

const DEFAULT_SUPPORT_LINK = "https://t.me/vibexAcademybd";

function supportHandle(link: string) {
  const m = link.match(/t\.me\/([A-Za-z0-9_]+)/);
  return m ? `@${m[1]}` : link;
}

async function supportView() {
  const s = await getSettings();
  const link = (s["support_link"] || "").trim() || DEFAULT_SUPPORT_LINK;
  const handle = supportHandle(link);
  const body =
    (s["support_text"] || "").trim() ||
    "Need help? Tap <b>Create Ticket</b> below to chat with our team.";
  const rules =
    (s["support_rules"] || "").trim() ||
    "• Response time can vary from <b>24 to 72 hours</b>. Please be patient and do not create duplicate tickets.\n" +
      "• Refunds eligible <b>strictly as per product description</b> terms &amp; time.\n" +
      "• <b>Video Proof:</b> Uncut video of purchase &amp; issue is mandatory for refund/replacement <i>(if stated in product description)</i>. No video = no refund.\n" +
      "• Technical assistance is provided for all orders.";
  const text =
    `${sectionHead(s, "support", `<b>${escapeHtml(uiText(s, "sup_title"))}</b>`)}\n──────────────\n${body}\n\n` +
    `⚠️ <b>Support Rules:</b>\n${rules}\n──────────────\n` +
    `${uiTag(s, "sup_admin")} — <a href="${escapeHtml(link)}">${escapeHtml(handle)}</a>`;
  const kb: Button[][] = [
    [{ text: "🆘 Create Support Ticket", callback_data: "sup:new" }],
    [{ text: "🎫 My Tickets", callback_data: "sup:list" }],
    [uiBtn(s, "sup_back", "home")],
  ];

  return { text, kb };
}

/* ------------------------------------------------------- support tickets */

function ticketCode(no: number | string) {
  return `#T${String(no).padStart(4, "0")}`;
}

async function ticketListView(telegramId: number) {
  const { data } = await db
    .from("support_tickets")
    .select("id,ticket_no,subject,status,updated_at")
    .eq("telegram_id", telegramId)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as any[];
  const kb: Button[][] = rows.map((t) => [
    {
      text: `${t.status === "open" ? "🟢" : "⚪️"} ${ticketCode(t.ticket_no)} · ${String(t.subject || "Ticket").slice(0, 28)}`,
      callback_data: `sup:t:${t.id}`,
    },
  ]);
  kb.push([{ text: "🆘 Create Support Ticket", callback_data: "sup:new" }]);
  kb.push([styled({ text: "⬅️ Back", callback_data: "support" }, "danger")]);
  return {
    text: rows.length
      ? `🎫 <b>My Tickets</b>\n──────────────\nTap a ticket to read the conversation or reply.`
      : `🎫 <b>My Tickets</b>\n──────────────\nYou have no tickets yet.`,
    kb,
  };
}

async function ticketView(ticketId: string, viewer: "user" | "admin") {
  const { data: t } = await db.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) return { text: "❌ Ticket not found.", kb: [[styled({ text: "⬅️ Back", callback_data: "support" }, "danger")]] as Button[][] };
  const { data: msgs } = await db
    .from("support_messages")
    .select("sender,sender_name,body,created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(30);
  const lines = (msgs ?? []).map((m: any) => {
    const who = m.sender === "admin" ? "🛡 <b>Support</b>" : "👤 <b>You</b>";
    const whoAdmin = m.sender === "admin" ? "🛡 <b>Support</b>" : `👤 <b>${escapeHtml(m.sender_name || "User")}</b>`;
    return `${viewer === "admin" ? whoAdmin : who}\n${escapeHtml(String(m.body)).slice(0, 900)}`;
  });
  const head =
    `🎫 <b>Ticket ${ticketCode(t.ticket_no)}</b> · ${t.status === "open" ? "🟢 open" : "⚪️ closed"}\n` +
    (viewer === "admin"
      ? `👤 ${t.username ? "@" + escapeHtml(t.username) : "—"} · <code>${t.telegram_id}</code>\n`
      : "") +
    `──────────────\n`;
  const kb: Button[][] =
    viewer === "admin"
      ? [
          [{ text: "✍️ Reply", callback_data: `adm:tkr:${t.id}` }],
          t.status === "open"
            ? [{ text: "✅ Close ticket", callback_data: `adm:tkc:${t.id}` }]
            : [{ text: "♻️ Reopen ticket", callback_data: `adm:tko:${t.id}` }],
          [styled({ text: "⬅️ Tickets", callback_data: "adm:tk" }, "danger")],
        ]
      : [
          ...(t.status === "open"
            ? [
                [{ text: "✍️ Reply", callback_data: `sup:r:${t.id}` }],
                [{ text: "✅ Close ticket", callback_data: `sup:c:${t.id}` }],
              ]
            : []),
          [styled({ text: "⬅️ My Tickets", callback_data: "sup:list" }, "danger")],
        ];
  return { text: head + (lines.join("\n\n") || "<i>No messages yet.</i>"), kb };
}

async function createTicket(user: any, body: string) {
  const subject = body.replace(/\s+/g, " ").trim().slice(0, 60) || "Support request";
  const { data: t } = await db
    .from("support_tickets")
    .insert({
      telegram_id: user.telegram_id,
      username: user.username ?? null,
      subject,
      status: "open",
      last_message: body.slice(0, 500),
      unread_admin: 1,
    })
    .select("*")
    .maybeSingle();
  if (!t) return null;
  await db.from("support_messages").insert({
    ticket_id: t.id,
    sender: "user",
    sender_name: user.username || user.first_name || String(user.telegram_id),
    body,
  });
  await notifyAdmins(
    `🆘 <b>New support ticket ${ticketCode(t.ticket_no)}</b>\n` +
      `👤 ${user.username ? "@" + escapeHtml(user.username) : escapeHtml(user.first_name ?? "user")} · <code>${user.telegram_id}</code>\n` +
      `──────────────\n${escapeHtml(body).slice(0, 900)}`,
    [[{ text: "✍️ Open & reply", callback_data: `adm:tk:${t.id}` }]],
  );
  return t;
}

/** Post a reply into a ticket and push it to the other side. */
export async function postTicketReply(
  ticketId: string,
  sender: "user" | "admin",
  body: string,
  senderName?: string,
) {
  const { data: t } = await db.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) throw new Error("Ticket not found");
  await db.from("support_messages").insert({
    ticket_id: ticketId,
    sender,
    sender_name: senderName ?? (sender === "admin" ? "Support" : null),
    body,
  });
  await db
    .from("support_tickets")
    .update({
      last_message: body.slice(0, 500),
      status: t.status === "closed" ? "open" : t.status,
      unread_admin: sender === "user" ? Number(t.unread_admin ?? 0) + 1 : 0,
      unread_user: sender === "admin" ? Number(t.unread_user ?? 0) + 1 : 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  if (sender === "admin" && t.telegram_id) {
    await sendMessage(
      Number(t.telegram_id),
      `🛡 <b>Support reply · ${ticketCode(t.ticket_no)}</b>\n──────────────\n${escapeHtml(body)}`,
      [
        [{ text: "✍️ Reply", callback_data: `sup:r:${t.id}` }],
        [{ text: "🎫 My Tickets", callback_data: "sup:list" }],
      ],
    );
  }
  if (sender === "user") {
    await notifyAdmins(
      `💬 <b>Ticket ${ticketCode(t.ticket_no)} · new reply</b>\n` +
        `👤 <code>${t.telegram_id}</code>\n──────────────\n${escapeHtml(body).slice(0, 900)}`,
      [[{ text: "✍️ Open & reply", callback_data: `adm:tk:${t.id}` }]],
    );
  }
  return true;
}

/** Close or reopen a ticket and tell the customer. */
export async function setTicketStatus(ticketId: string, status: "open" | "closed", by: "user" | "admin") {
  const { data: t } = await db.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!t) throw new Error("Ticket not found");
  await db.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (by === "admin" && t.telegram_id) {
    await sendMessage(
      Number(t.telegram_id),
      status === "closed"
        ? `✅ <b>Ticket ${ticketCode(t.ticket_no)} closed.</b>\nThanks for contacting support — open a new ticket any time.`
        : `♻️ <b>Ticket ${ticketCode(t.ticket_no)} reopened.</b>`,
      [[{ text: "🎫 My Tickets", callback_data: "sup:list" }]],
    );
  }
  if (by === "user") {
    await notifyAdmins(`✅ Customer closed ticket ${ticketCode(t.ticket_no)} (<code>${t.telegram_id}</code>).`);
  }
  return true;
}

/** Bot-admin ticket list. */
async function admTicketsView() {
  const { data } = await db
    .from("support_tickets")
    .select("id,ticket_no,username,telegram_id,subject,status,unread_admin")
    .order("updated_at", { ascending: false })
    .limit(15);
  const rows = (data ?? []) as any[];
  const kb: Button[][] = rows.map((t) => [
    {
      text: `${t.status === "open" ? "🟢" : "⚪️"}${Number(t.unread_admin) > 0 ? "🔔" : ""} ${ticketCode(t.ticket_no)} · ${
        t.username ? "@" + t.username : t.telegram_id
      }`,
      callback_data: `adm:tk:${t.id}`,
    },
  ]);
  kb.push(ADM_BACK[0]!);
  return {
    text: rows.length
      ? `🎫 <b>Support tickets</b> (${rows.length})\nTap a ticket to read and reply.`
      : "🎫 <b>Support tickets</b>\n\nNo tickets yet.",
    kb,
  };
}

/** Support callbacks for customers. Returns true when handled. */
async function handleSupportCallback(
  chatId: number,
  data: string,
  user: any,
  edit: (text: string, kb?: Button[][]) => Promise<void>,
): Promise<boolean> {
  if (data === "sup:new") {
    await setState(chatId, { ...((user.state ?? {}) as any), awaiting: "sup_new" });
    await edit(
      "🎟 <b>Create Support Ticket</b>\n\nPlease type and send your support inquiry or issue message below:\n\n" +
        "⚠️ <b>Friendly Reminder:</b> Refunds follow product description terms &amp; time. Keep an uncut video " +
        "recording ready if the product description requires it (No video = no refund). Technical help is always available!",
      [[{ text: "⛔️ Cancel", callback_data: "support" }]],
    );
    return true;
  }
  if (data === "sup:list") {
    const v = await ticketListView(chatId);
    await edit(v.text, v.kb);
    return true;
  }
  if (data.startsWith("sup:t:")) {
    const v = await ticketView(data.slice(6), "user");
    await edit(v.text, v.kb);
    return true;
  }
  if (data.startsWith("sup:r:")) {
    await setState(chatId, { ...((user.state ?? {}) as any), awaiting: "sup_reply", sup_ticket: data.slice(6) });
    await edit("✍️ Send your reply message for this ticket.", [
      [{ text: "⛔️ Cancel", callback_data: `sup:t:${data.slice(6)}` }],
    ]);
    return true;
  }
  if (data.startsWith("sup:c:")) {
    await setTicketStatus(data.slice(6), "closed", "user");
    const v = await ticketView(data.slice(6), "user");
    await edit(v.text, v.kb);
    return true;
  }
  return false;
}


/* ------------------------------------------------- referral credit store */

type RefState = {
  earned: number;
  spent: number;
  day: string;
  dayCount: number;
  credited?: boolean;
  purchases: { name: string; credits: number; at: string }[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function refState(user: any): RefState {
  const raw = ((user?.state ?? {}) as any).refstore ?? {};
  return {
    earned: Number(raw.earned ?? 0),
    spent: Number(raw.spent ?? 0),
    day: String(raw.day ?? today()),
    dayCount: Number(raw.dayCount ?? 0),
    credited: Boolean(raw.credited),
    purchases: Array.isArray(raw.purchases) ? raw.purchases : [],
  };
}

async function saveRefState(user: any, next: RefState) {
  await setState(user.telegram_id, { ...((user.state ?? {}) as any), refstore: next });
}

function refCredits(user: any) {
  const st = refState(user);
  return Math.max(0, st.earned - st.spent);
}

/** Rewards catalog: one per line — `Name|credits` */
function refRewards(settings: Record<string, string>) {
  return (settings["referral_rewards"] || "Gemini AI Pro 18 Month|10")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [name, credits] = l.split("|");
      return { id: String(i), name: (name ?? "").trim(), credits: Math.max(1, Number(credits ?? 10)) };
    })
    .filter((r) => r.name);
}

/**
 * Credit the inviter once the invited friend actually views a product.
 * Respects a configurable daily cap on counted invites.
 */
async function awardReferralCredit(user: any) {
  if (!user?.referred_by) return;
  const mine = refState(user);
  if (mine.credited) return;
  await saveRefState(user, { ...mine, credited: true });

  const s = await getSettings();
  const per = Math.max(1, Number(s["referral_credit_per_invite"] || 1));
  const cap = Math.max(1, Number(s["referral_daily_cap"] || 10));

  const inviter = await getUser(user.referred_by);
  if (!inviter) return;
  const st = refState(inviter);
  const day = today();
  const dayCount = st.day === day ? st.dayCount : 0;
  if (dayCount >= cap) return;

  await saveRefState(inviter, { ...st, earned: st.earned + per, day, dayCount: dayCount + 1 });
  await sendMessage(
    inviter.telegram_id,
    `🎯 <b>+${per} referral credit!</b>\nYour invite just viewed a product. Open the Referral Store to spend your credits.`,
    [[uiBtn(s, "prof_refer_btn", "refstore")]],
  ).catch(() => undefined);
}

async function refStoreView(user: any) {
  const s = await getSettings();
  const st = refState(user);
  const credits = refCredits(user);
  const per = Math.max(1, Number(s["referral_credit_per_invite"] || 1));
  const cap = Math.max(1, Number(s["referral_daily_cap"] || 10));
  const rate = Number(s["referral_redeem_rate"] || 0);
  const rewards = refRewards(s);
  const link = refLink(s, user);

  const text =
    `${sectionHead(s, "refstore", `<b>${escapeHtml(uiText(s, "ref_title").toUpperCase().split("").join(" "))}</b>`)}\n──────────────\n` +
    `<b>How it works</b>\n` +
    `• Invite a brand-new member with <b>your link</b> — each one earns you <b>${per} credit${per > 1 ? "s" : ""}</b>.\n` +
    `• The credit lands once your friend opens the shop and <b>views a product</b>.\n` +
    `• Up to <b>${cap} invites per day</b> are counted — extra invites that day are skipped.\n` +
    (rate > 0
      ? `• Spend credits on the rewards below, or redeem them to your wallet (<b>${money(rate)} per credit</b>).\n\n`
      : `• Spend credits on the rewards below.\n\n`) +
    `${uiTag(s, "prof_link")}\n<code>${escapeHtml(link)}</code>\n` +
    `${uiTag(s, "ref_code")}  <code>${escapeHtml(String(user.ref_code ?? ""))}</code>\n\n` +
    `${uiTag(s, "prof_refs")}  <b>${user.referral_count ?? 0}</b>\n` +
    `${uiTag(s, "ref_credits")}  <b>${credits}</b>\n\n` +
    (rewards.some((r) => credits >= r.credits)
      ? `<i>Tap a reward below to claim it instantly.</i>`
      : `<i>Not enough credits for any reward yet — invite more friends${rate > 0 ? " or redeem your credits to your wallet" : ""}.</i>`);

  const kb: Button[][] = rewards.map((r) => {
    const key = credits >= r.credits ? ("ref_reward" as const) : ("ref_locked" as const);
    const btn = uiBtn(s, key, `refbuy:${r.id}`);
    const suffix =
      credits >= r.credits
        ? `(${uiText(s, "ref_reward")})`
        : `(${uiText(s, "ref_locked")} ${r.credits - credits} more)`;
    const icon = btn.text.replace(uiText(s, key), "").trim();
    return [{ ...btn, text: `${icon} ${r.name} | ${r.credits} ${suffix}`.trim(), style: "primary" as const }];
  });

  kb.push([
    uiUrlBtn(s, "ref_share_btn", shareUrl(s, user)),
    ...(rate > 0 ? [uiBtn(s, "ref_cash_btn", "refcash")] : []),
  ]);
  kb.push([
    uiBtn(s, "ref_purch_btn", "refbought", `(${st.purchases.length})`),
    uiBtn(s, "ref_earn_btn", "refearn"),
  ]);
  kb.push([styled(uiBtn(s, "ref_profile_btn", "profile"), "danger")]);
  return { text, kb };
}

async function refPurchasesView(user: any) {
  const s = await getSettings();
  const st = refState(user);
  const list = st.purchases.length
    ? st.purchases
        .map((p, i) => `${i + 1}. <b>${escapeHtml(p.name)}</b> — ${p.credits} ${uiIconHtml(s, "ref_credits")} <i>(${fmtDate(p.at)})</i>`)
        .join("\n")
    : "No reward claimed yet.";
  const text = `<b>${escapeHtml(uiText(s, "ref_purch_title"))}</b>\n──────────────\n${list}\n──────────────\n${uiIconHtml(
    s,
    "ref_credits",
  )} Credits left: <b>${refCredits(user)}</b>`;
  return { text, kb: [[uiBtn(s, "prof_refer_btn", "refstore")], [styled(uiBtn(s, "ref_profile_btn", "profile"), "danger")]] };
}


/** Claim a reward with credits — admins get a manual delivery ping. */
async function claimRefReward(user: any, rewardId: string) {
  const s = await getSettings();
  const reward = refRewards(s).find((r) => r.id === rewardId);
  if (!reward) return { text: "That reward is no longer available.", kb: [[uiBtn(s, "prof_refer_btn", "refstore")]] };
  const st = refState(user);
  const credits = Math.max(0, st.earned - st.spent);
  if (credits < reward.credits) {
    return {
      text: `🔒 You need <b>${reward.credits - credits}</b> more credit(s) for <b>${escapeHtml(reward.name)}</b>.`,
      kb: [[uiBtn(s, "prof_refer_btn", "refstore")]],
    };
  }
  await saveRefState(user, {
    ...st,
    spent: st.spent + reward.credits,
    purchases: [...st.purchases, { name: reward.name, credits: reward.credits, at: new Date().toISOString() }],
  });
  for (const adminId of adminIds(s)) {
    await sendMessage(
      Number(adminId),
      `🎯 <b>Referral reward claimed</b>\nUser: ${user.username ? "@" + user.username : user.telegram_id} (<code>${
        user.telegram_id
      }</code>)\nReward: <b>${escapeHtml(reward.name)}</b> (${reward.credits} credits)\nPlease deliver it manually.`,
    ).catch(() => undefined);
  }
  return {
    text:
      `✅ <b>${escapeHtml(reward.name)}</b> claimed for <b>${reward.credits}</b> credits!\n\n` +
      `Our team will deliver it to you shortly right here in this chat.`,
    kb: [[uiBtn(s, "prof_refer_btn", "refstore")], [styled(uiBtn(s, "ref_profile_btn", "profile"), "danger")]],
  };
}

/** Convert credits into wallet balance at the configured rate. */
async function redeemRefCredits(user: any) {
  const s = await getSettings();
  const rate = Number(s["referral_redeem_rate"] || 0);
  const st = refState(user);
  const credits = Math.max(0, st.earned - st.spent);
  if (rate <= 0 || credits <= 0) {
    return { text: "You have no credits to redeem right now.", kb: [[uiBtn(s, "prof_refer_btn", "refstore")]] };
  }
  const amount = credits * rate;
  await saveRefState(user, { ...st, spent: st.spent + credits });
  await db
    .from("bot_users")
    .update({ balance: Number(user.balance ?? 0) + amount })
    .eq("telegram_id", user.telegram_id);
  await db
    .from("transactions")
    .insert({ telegram_id: user.telegram_id, type: "referral", amount, note: `Redeemed ${credits} referral credits` })
    .then(
      () => undefined,
      () => undefined,
    );
  return {
    text: `💱 Redeemed <b>${credits}</b> credits → <b>${money(amount)}</b> added to your wallet.`,
    kb: [[uiBtn(s, "prof_refer_btn", "refstore")], [styled(uiBtn(s, "ref_profile_btn", "profile"), "danger")]],
  };
}


async function productsWithStock() {
  const { data: products } = await db
    .from("products")
    .select("*")
    .eq("is_active", true)
    .is("owner_reseller_id", null)
    .order("sort_order", { ascending: true });
  const { data: stock } = await db.from("stock_items").select("product_id").eq("is_sold", false);
  const counts: Record<string, number> = {};
  for (const s of stock ?? []) counts[s.product_id] = (counts[s.product_id] ?? 0) + 1;
  const rows = (products ?? []).map((p: any) => ({
    ...p,
    stock: p.supplier_id ? Number(p.supplier_stock ?? 0) : (counts[p.id] ?? 0),
  }));
  // Admin-pinned products (featured_rank 1,2,3…) always come first, in that
  // exact serial; everything else keeps the normal sort_order.
  return rows.sort((a: any, b: any) => {
    const ra = Number(a.featured_rank ?? 0) || Number.MAX_SAFE_INTEGER;
    const rb = Number(b.featured_rank ?? 0) || Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
  });
}

const PAGE = 30;

function isFlash(p: any) {
  return Number(p.old_price ?? 0) > Number(p.price) && (p.delivery_type === "manual" || (p.stock ?? 0) > 0);
}

/** Category → product links (a product can sit in several categories). */
async function categoryLinks() {
  const [{ data: cats }, { data: links }] = await Promise.all([
    db.from("categories").select("id,name,emoji,sort_order,channel,is_active").eq("is_active", true).order("sort_order"),
    db.from("product_categories").select("product_id,category_id"),
  ]);
  const byCat: Record<string, Set<string>> = {};
  for (const l of links ?? []) (byCat[l.category_id] ??= new Set()).add(l.product_id);
  const categories = (cats ?? []).filter((c: any) => (c.channel ?? "both") !== "website");
  return { categories, byCat };
}

function productsOfCategory(products: any[], catId: string, byCat: Record<string, Set<string>>) {
  const set = byCat[catId];
  return products.filter((p: any) => (set && set.has(p.id)) || p.category_id === catId);
}

/** Category icon (Premium custom emoji id lives in bot_settings, glyph on the row). */
function catIcon(settings: Record<string, string>, cat: any) {
  return parseIconValue(settings[`cat_icon_${cat.id}`] ?? "", String(cat?.emoji || "📁"));
}

/** "All products" button icon — Premium custom emoji supported (cat_icon_all). */
function allProductsIcon(settings: Record<string, string>) {
  return parseIconValue(settings["cat_icon_all"] ?? "", "🗂");
}

/* ---------------------------------------- configurable button colours */

type ColorSlot = "category" | "product" | "orders" | "pagination" | "wallet" | "api" | "nav" | "menu";

const COLOR_SLOTS: { key: ColorSlot; label: string; def: ButtonStyle }[] = [
  { key: "category", label: "Category cards", def: "primary" },
  { key: "product", label: "Product cards", def: "primary" },
  { key: "orders", label: "Order list cards", def: "primary" },
  { key: "pagination", label: "Pagination (Prev/Next)", def: "primary" },
  { key: "wallet", label: "Wallet & payment buttons", def: "primary" },
  { key: "api", label: "Reseller API buttons", def: "primary" },
  { key: "nav", label: "Navigation & actions", def: "success" },
  { key: "menu", label: "Main menu", def: "primary" },
];

const COLOR_LABEL: Record<ButtonStyle, string> = {
  primary: "🔵 Blue",
  success: "🟢 Green",
  danger: "🔴 Red",
};

const COLOR_ORDER: ButtonStyle[] = ["primary", "success", "danger"];

/** Colour for a button slot — admin configurable via bot_settings (btn_color_<slot>). */
function btnColor(settings: Record<string, string>, slot: ColorSlot): ButtonStyle {
  const def = COLOR_SLOTS.find((s) => s.key === slot)?.def ?? "success";
  const v = String(settings[`btn_color_${slot}`] ?? "").trim().toLowerCase();
  return (COLOR_ORDER as string[]).includes(v) ? (v as ButtonStyle) : def;
}

function categoryButton(settings: Record<string, string>, cat: any, text: string, callback_data: string): Button {
  const { customId } = catIcon(settings, cat);
  return {
    text,
    callback_data,
    ...(customId ? { icon_custom_emoji_id: customId } : {}),
  };
}


/** Category picker — blue category buttons, green navigation buttons. */
async function shopView(page: number) {
  const settings = await getSettings();
  const products = await productsWithStock();
  const inStock = products.filter((p: any) => p.delivery_type === "manual" || p.stock > 0).length;
  const flash = products.filter(isFlash);
  const { categories, byCat } = await categoryLinks();
  const withProducts = categories
    .map((c: any) => ({ ...c, items: productsOfCategory(products, c.id, byCat) }))
    .filter((c: any) => c.items.length > 0);

  if (withProducts.length) {
    const kb: Button[][] = [];
    const catStyle = btnColor(settings, "category");
    const navStyle = btnColor(settings, "nav");
    if (flash.length)
      kb.push([styled(uiBtn(settings, "shop_flash", "flash", `(${flash.length})`), btnColor(settings, "product"))]);
    for (let i = 0; i < withProducts.length; i += 3) {
      const row: Button[] = [];
      for (const c of withProducts.slice(i, i + 3)) {
        const ic = catIcon(settings, c);
        row.push(
          styled(
            categoryButton(
              settings,
              c,
              ic.customId ? `${c.name} (${c.items.length})` : `${ic.glyph} ${c.name} (${c.items.length})`,
              `cat:${c.id}:0`,
            ),
            catStyle,
          ),
        );
      }
      kb.push(row);
    }


    const allIc = allProductsIcon(settings);
    kb.push([
      styled(
        {
          text: allIc.customId ? "All products" : `${allIc.glyph} All products`,
          callback_data: "cat:all:0",
          ...(allIc.customId ? { icon_custom_emoji_id: allIc.customId } : {}),
        },
        navStyle,
      ),
    ]);
    kb.push([styled(iconButton(settings, "refresh", "shop:0"), navStyle)]);
    kb.push([
      styled(iconButton(settings, "cart", "cart"), navStyle),
      styled(iconButton(settings, "back", "home"), "danger"),
    ]);
    const text =
      `${sectionHead(settings, "shop", `${pageIconHtml(settings, "shop")} <b>C A T E G O R I E S</b>`)}\n\n` +
      `${uiIconHtml(settings, "shop_instock")} <b>${inStock} of ${products.length}</b> ${uiText(settings, "shop_instock")}\n` +
      `<i>Pick a category to see its products.</i>`;
    return { text, kb };
  }

  return allProductsView(page);
}

/** Flat product list — original shop page, optionally scoped to one category. */
async function allProductsView(page: number, catId: "all" | string = "all") {
  const settings = await getSettings();
  const all = await productsWithStock();
  let title = "P R O D U C T S";
  let products = all;
  let hasCategories = false;
  if (catId !== "all") {
    const { categories, byCat } = await categoryLinks();
    const cat = categories.find((c: any) => c.id === catId);
    products = productsOfCategory(all, catId, byCat);
    if (cat) {
      const ic = catIcon(settings, cat);
      const iconHtml = ic.customId
        ? `<tg-emoji emoji-id="${ic.customId}">${escapeHtml(ic.glyph)}</tg-emoji>`
        : escapeHtml(ic.glyph);
      title = `${iconHtml} ${String(cat.name).toUpperCase()}`;
    }

    hasCategories = true;
  } else {
    const { categories, byCat } = await categoryLinks();
    hasCategories = categories.some((c: any) => productsOfCategory(all, c.id, byCat).length > 0);
  }
  const back = catId === "all" ? "cat:all" : `cat:${catId}`;
  const inStock = products.filter((p: any) => p.delivery_type === "manual" || p.stock > 0).length;
  const flash = products.filter(isFlash);
  const slice = products.slice(page * PAGE, page * PAGE + PAGE);
  const kb: Button[][] = [];
  const prodStyle = btnColor(settings, "product");
  const pageStyle = btnColor(settings, "pagination");
  const navStyle = btnColor(settings, "nav");
  if (flash.length && page === 0)
    kb.push([styled(uiBtn(settings, "shop_flash", "flash", `(${flash.length})`), prodStyle)]);
  for (const p of slice) {
    kb.push([
      styled(
        productIconButton(
          p,
          `${p.name} | ${money(p.price)} | ${p.delivery_type === "manual" ? "manual" : `📦 ${p.stock}`}`,
          `p:${p.id}`,
        ),
        prodStyle,
      ),
    ]);
  }
  const nav: Button[] = [];
  if (page > 0) nav.push(styled(uiBtn(settings, "shop_prev", `${back}:${page - 1}`), pageStyle));
  if (products.length > (page + 1) * PAGE)
    nav.push(styled(uiBtn(settings, "shop_next", `${back}:${page + 1}`), pageStyle));
  if (nav.length) kb.push(nav);
  kb.push([styled(iconButton(settings, "refresh", `${back}:${page}`), navStyle)]);
  if (hasCategories) kb.push([styled({ text: "🗂 Categories", callback_data: "shop:0" }, navStyle)]);
  kb.push([
    styled(iconButton(settings, "cart", "cart"), navStyle),
    styled(iconButton(settings, "back", "home"), "danger"),
  ]);


  const text =
    `${sectionHead(settings, "products", `${pageIconHtml(settings, "shop")} <b>${title}</b>`)}\n\n` +
    `${uiIconHtml(settings, "shop_instock")} <b>${inStock} of ${products.length}</b> ${uiText(settings, "shop_instock")}\n` +
    (flash.length
      ? `${uiTag(settings, "shop_flash")} — <b>${flash.length}</b> discounted item(s) live now\n`
      : "") +
    `<i>Tap a product below to view details.</i>`;
  return { text, kb };
}

/** Flash / sale section — every product that currently runs a discount. */
/** Freebies — every zero-priced product can be claimed free once per window. */
async function freebiesView() {
  const settings = await getSettings();
  const products = (await productsWithStock()).filter(
    (p: any) => Number(p.price) <= 0 && (p.delivery_type === "manual" || p.stock > 0),
  );
  const head = `${uiIconHtml(settings, "free_title")} <b>${escapeHtml(uiText(settings, "free_title"))}</b>\n─────────────\n`;
  const freeTag = `${uiText(settings, "free_tag")}`;
  const intro =
    (settings["freebies_text"] || "").trim() ||
    "Every product below can be claimed <b>FREE</b> once per its free window.\n\n" +
      "After you claim, your next free claim unlocks when that window resets — until then you can still buy more at the normal price.";

  const navRows = (): Button[][] => [
    [uiBtn(settings, "free_refresh", "freebies")],
    [uiBtn(settings, "free_shop", "shop:0"), uiBtn(settings, "free_back", "home")],
  ];

  if (!products.length) {
    return {
      text: `${head}\n${intro}\n\n<i>No offer found — no free offers are running right now.</i>`,
      kb: navRows(),
    };
  }

  const kb: Button[][] = products
    .slice(0, 20)
    .map((p: any) => [productIconButton(p, `${p.name} | ${freeTag}`, `p:${p.id}`)]);
  for (const row of navRows()) kb.push(row);
  return {
    text: `${head}\n${intro}\n\n<i>Tap a product to claim:</i>`,
    kb,
  };

}

async function flashView() {
  const settings = await getSettings();
  const products = (await productsWithStock()).filter(isFlash);
  const head = `${uiTag(settings, "shop_flash")}\n──────────────\n`;
  if (!products.length) {
    return {
      text: `${head}\nNo active deals right now. Check back soon!`,
      kb: [
        [iconButton(settings, "shop", "shop:0")],
        [iconButton(settings, "back", "home")],
      ] as Button[][],
    };
  }
  const list = products
    .slice(0, 20)
    .map((p: any) => {
      const off = Math.round((1 - Number(p.price) / Number(p.old_price)) * 100);
      return (
        `${uiIconHtml(settings, "flash_tag")} <b>${escapeHtml(p.name)}</b> — <s>${money(p.old_price)}</s> → ` +
        `<b>${money(p.price)}</b> (-${off}%)`
      );
    })
    .join("\n");
  const kb: Button[][] = products
    .slice(0, 20)
    .map((p: any) => [productIconButton(p, `${p.name} · ${money(p.price)}`, `p:${p.id}`)]);
  kb.push([iconButton(settings, "refresh", "flash")]);
  kb.push([iconButton(settings, "shop", "shop:0"), iconButton(settings, "back", "home")]);
  return {
    text:
      `${head}${list}\n──────────────\n` +
      `${uiTag(settings, "flash_timer")}\n<i>Tap a product to grab it before the deal ends:</i>`,
    kb,
  };
}

/** "2d 3h 18m" style countdown, or null when the deadline passed / is unset. */
function countdown(iso?: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const parts = [d ? `${d}d` : "", h ? `${h}h` : "", `${m % 60}m`].filter(Boolean);
  return parts.join(" ");
}

async function productView(productId: string) {
  const { data: p } = await db.from("products").select("*").eq("id", productId).maybeSingle();
  // Products switched off in admin are hidden from the bot, exactly like the website.
  if (!p || p.is_active === false || p.owner_reseller_id) return null;
  const [{ count }, { count: soldCount }] = await Promise.all([
    db
      .from("stock_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("is_sold", false),
    db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
  ]);
  const stock = p.supplier_id ? Number(p.supplier_stock ?? 0) : (count ?? 0);
  const sold = soldCount ?? 0;
  const hasDrop = p.old_price && Number(p.old_price) > Number(p.price);
  const off = hasDrop
    ? Math.round((1 - Number(p.price) / Number(p.old_price)) * 100)
    : 0;

  const settings = await getSettings();
  const ends =
    countdown(settings[`flash_ends_${p.id}`] ?? null) ?? countdown(settings["flash_ends_at"] ?? null);

  let text = `${productIconHtml(p)} <b>${escapeHtml(p.name)}</b>\n\n`;

  if (hasDrop) {
    text += `${uiIconHtml(settings, "prod_flash")} <b>${escapeHtml(uiText(settings, "prod_flash"))} -${off}%</b>\n`;
    text += `${escapeHtml(uiText(settings, "prod_price"))}: <s>${money(p.old_price)}</s> → <b>${money(p.price)}</b>\n`;
    if (ends)
      text += `${uiIconHtml(settings, "prod_ends")} <b>${escapeHtml(uiText(settings, "prod_ends"))}:</b> ${ends}\n`;
    text += `\n`;
  } else {
    text += `${uiTag(settings, "prod_price")}: <b>${money(p.price)}</b>\n\n`;
  }

  if (sold > 0)
    text += `${uiIconHtml(settings, "prod_sold")} <b>${sold}</b> ${escapeHtml(uiText(settings, "prod_sold"))}\n\n`;

  const descHtml = renderRich(p.description);
  if (descHtml)
    text +=
      `<b>${escapeHtml(uiText(settings, "prod_desc"))}</b>\n` +
      `<blockquote expandable>${descHtml}</blockquote>\n\n`;

  const important = renderRich(p.important_note ?? p.manual_note ?? "");
  if (important)
    text +=
      `<b>${escapeHtml(uiText(settings, "prod_important"))}</b>\n` +
      `<blockquote expandable>${uiIconHtml(settings, "prod_important_line")} ${important}</blockquote>\n\n`;

  const guide = renderRich(
    p.quick_guide ?? settings[`guide_${p.id}`] ?? settings["quick_guide_text"] ?? "",
  );
  if (guide)
    text +=
      `<blockquote expandable>${uiIconHtml(settings, "prod_guide")} <b>${escapeHtml(uiText(settings, "prod_guide"))}</b>\n` +
      `${guide}</blockquote>\n\n`;

  // Same supplier detail rows the website product page shows, so both surfaces
  // present identical product information.
  const detailRows = Array.isArray((p as any).details)
    ? ((p as any).details as any[])
        .map((d) => ({ label: String(d?.label ?? "").trim(), value: String(d?.value ?? "").trim() }))
        .filter((d) => d.label && d.value)
        .slice(0, 12)
    : [];
  if (detailRows.length)
    text +=
      `<blockquote expandable>` +
      detailRows.map((d) => `• <b>${escapeHtml(d.label)}:</b> ${escapeHtml(d.value)}`).join("\n") +
      `</blockquote>\n\n`;

  if (String(p.delivery_time ?? "").trim())
    text += `${uiTag(settings, "prod_delivery")}: <b>${escapeHtml(String(p.delivery_time).trim())}</b>\n\n`;


  text +=
    p.delivery_type === "manual"
      ? `<i>${uiTag(settings, "prod_manual_note")}</i>`
      : `${uiTag(settings, "prod_stock")}: <b>${stock} available</b>\n<i>${uiTag(settings, "prod_auto_note")}</i>`;

  const available = p.delivery_type === "manual" || stock > 0;
  const kb: Button[][] = [];
  if (available)
    kb.push([
      uiBtn(settings, "prod_buy", `qty:${p.id}`),
      uiBtn(settings, "prod_addcart", `cadd:${p.id}:1`),
    ]);
  else {
    kb.push([uiBtn(settings, "prod_out", `p:${p.id}`)]);
    kb.push([uiBtn(settings, "prod_notify", `notify:${p.id}`)]);
  }
  kb.push([
    uiBtn(settings, "prod_refresh", `p:${p.id}`),
    uiBtn(settings, "prod_back", "shop:0"),
  ]);
  kb.push([uiBtn(settings, "prod_cart", "cart"), uiBtn(settings, "prod_home", "home")]);
  return { text, kb, photo: bannerFor(p, settings), product: p };
}

/* ------------------------------------------------------------------- cart */

type CartLine = { product_id: string; qty: number };

function readCart(user: any): CartLine[] {
  const raw = (user?.state ?? {}).cart;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l: any) => l && typeof l.product_id === "string" && Number(l.qty) > 0)
    .map((l: any) => ({ product_id: l.product_id, qty: Math.min(999, Math.floor(Number(l.qty))) }));
}

async function writeCart(telegramId: number, cart: CartLine[]) {
  const { data } = await db
    .from("bot_users")
    .select("state")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  const state = (data?.state ?? {}) as any;
  state.cart = cart;
  await db.from("bot_users").update({ state }).eq("telegram_id", telegramId);
}

async function cartDetails(user: any) {
  const cart = readCart(user);
  if (!cart.length) return { lines: [] as any[], total: 0 };
  const { data: products } = await db
    .from("products")
    .select("*")
    .eq("is_active", true)
    .in(
      "id",
      cart.map((l) => l.product_id),
    );
  const { data: stock } = await db
    .from("stock_items")
    .select("product_id")
    .eq("is_sold", false)
    .in(
      "product_id",
      cart.map((l) => l.product_id),
    );
  const counts: Record<string, number> = {};
  for (const s of stock ?? []) counts[s.product_id] = (counts[s.product_id] ?? 0) + 1;

  const lines = cart
    .map((l) => {
      const p = (products ?? []).find((x: any) => x.id === l.product_id);
      if (!p) return null;
      return {
        product: p,
        qty: l.qty,
        stock: p.supplier_id ? Number(p.supplier_stock ?? 0) : (counts[p.id] ?? 0),
        subtotal: Number(p.price) * l.qty,
      };
    })
    .filter(Boolean) as any[];

  const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
  return { lines, total };
}

async function cartView(user: any) {
  const settings = await getSettings();
  const { lines, total } = await cartDetails(user);
  if (!lines.length) {
    return {
      text: `${sectionHead(settings, "cart", `${pageIconHtml(settings, "cart")} <b>Y O U R   C A R T</b>`)}\n\nYour cart is empty.\n\n<i>Browse the shop and tap “Add to Cart”.</i>`,
      kb: [
        [iconButton(settings, "shop", "shop:0")],
        [uiBtn(settings, "cart_home", "home")],
      ] as Button[][],
    };
  }

  let text = `${sectionHead(settings, "cart", `${pageIconHtml(settings, "cart")} <b>Y O U R   C A R T</b>`)}\n──────────────\n`;
  const kb: Button[][] = [];
  let issues = 0;
  for (const l of lines) {
    const short = l.product.delivery_type === "auto" && l.stock < l.qty;
    if (short) issues++;
    text +=
      `${productIconHtml(l.product)} <b>${l.product.name}</b>\n` +
      `   ${l.qty} × ${money(l.product.price)} = <b>${money(l.subtotal)}</b>` +
      (short ? `  ⚠️ only ${l.stock} in stock` : "") +
      `\n`;
    kb.push([
      { text: "➖", callback_data: `cdec:${l.product.id}` },
      { text: `${l.qty}× ${l.product.name}`.slice(0, 30), callback_data: `p:${l.product.id}` },
      { text: "➕", callback_data: `cinc:${l.product.id}` },
      { text: "🗑", callback_data: `crm:${l.product.id}` },
    ]);
  }
  text +=
    `──────────────\n${uiTag(settings, "cart_total")}: <b>${money(total)}</b>\n` +
    `💰 Balance: ${money(user.balance)}\n`;
  if (issues) text += `\n⚠️ Some items exceed available stock.\n`;

  kb.push([uiBtn(settings, "cart_checkout", "cchk", `· ${money(total)}`)]);
  kb.push([
    uiBtn(settings, "cart_continue", "shop:0"),
    uiBtn(settings, "cart_clear", "cclear"),
  ]);
  kb.push([uiBtn(settings, "cart_wallet", "wallet"), uiBtn(settings, "cart_home", "home")]);
  return { text, kb };
}


/** Binance gateway configuration coming from the admin dashboard. */
export async function binanceConfig() {
  const s = await getSettings();
  const on = (k: string, def = true) => (s[k] === undefined || s[k] === "" ? def : s[k] === "1" || s[k] === "true");
  return {
    active: (s["binance_status"] ?? "active") !== "inactive",
    live: (s["binance_mode"] ?? "live") !== "personal",
    payid: on("binance_enable_payid"),
    crypto: on("binance_enable_crypto"),
    rate: Number(s["dollar_rate"] || 0) || 0,
    payAddress: s["binance_pay"] ?? "",
  };
}

async function walletView(user: any) {
  const cfg = await binanceConfig();
  const s = await getSettings();
  const text =
    `${sectionHead(s, "wallet", `${pageIconHtml(s, "wallet")} <b>W A L L E T</b>`)}\n\n` +
    `Your Balance and Spending Stats are:\n──────────────\n` +
    `💰 Balance: <b>${money(user.balance)}</b>\n` +
    `💎 Total Spent: ${money(user.total_spent)}\n` +
    `🏅 Membership: ${user.membership}\n` +
    `──────────────\n\n` +
    `<i>Choose a payment method below to add funds to your wallet.</i>`;
  const walStyle = btnColor(s, "wallet");
  const wBtn = (b: Button) => styled(b, walStyle);
  const kb: Button[][] = [];
  if (cfg.active && cfg.payid)
    kb.push([wBtn(uiBtn(s, "wal_binance", "dep:binance", cfg.live ? "(auto)" : "(manual)"))]);
  if (cfg.active && cfg.crypto && cfg.live) kb.push([wBtn(uiBtn(s, "wal_usdt", "dep:usdt"))]);
  {
    const { paykoriConfig, PAYKORI_METHODS } = await import("@/lib/paykori.server");
    const pk = paykoriConfig(s);
    if (pk.enabled) {
      const row: Button[] = [];
      for (const m of pk.methods) {
        row.push(wBtn(uiBtn(s, `wal_${m}` as any, `pkr:${m}`, "(auto)")));
        if (row.length === 2) {
          kb.push([...row]);
          row.length = 0;
        }
      }
      if (row.length) kb.push([...row]);
      void PAYKORI_METHODS;
    } else {
      kb.push([wBtn(uiBtn(s, "wal_bkash", "dep:bkash")), wBtn(uiBtn(s, "wal_nagad", "dep:nagad"))]);
    }
  }

  kb.push([wBtn(uiBtn(s, "wal_redeem", "redeem"))]);
  kb.push([wBtn(uiBtn(s, "wal_history", "hist:0"))]);
  kb.push([uiBtn(s, "wal_home", "home")]);
  return { text, kb };
}

const DEPOSIT_LABEL: Record<string, { name: string; key: string }> = {
  bkash: { name: "bKash", key: "bkash_number" },
  nagad: { name: "Nagad", key: "nagad_number" },
};

/* ---------------------------------------------------------------- binance */

const NETWORKS: Record<string, string> = {
  BSC: "USDT BEP-20 (BSC)",
  TRX: "USDT TRC-20 (Tron)",
};

async function txUsed(tx: string) {
  const { data } = await db.from("binance_used_txs").select("tx_id").eq("tx_id", tx).maybeSingle();
  return !!data;
}

/** Unique USDT amount so concurrent deposits can be told apart. */
function uniqueAmount(base: number) {
  return Math.round((base + Math.floor(Math.random() * 99 + 1) / 10000) * 10000) / 10000;
}

async function startBinanceDeposit(
  chatId: number,
  kind: "payid" | "crypto",
  amount: number,
  network?: string,
  meta: Record<string, unknown> = {},
) {
  const s = await getSettings();
  const amountUsdt = uniqueAmount(amount);
  const personal = (s["binance_mode"] ?? "live") === "personal";
  let address = "";

  if (kind === "payid") {
    address = (s["binance_pay"] || "").trim();
    if (!address)
      return { error: "Binance Pay is not set up yet. Please contact support or use another payment method." };
  } else {
    const fallbackKey = network === "TRX" ? "usdt_trc20" : "usdt_bep20";
    address = (s[fallbackKey] || "").trim();
    if (!address && !personal) {
      // Only ask Binance when the admin has not pinned a wallet address.
      try {
        const { getDepositAddress } = await import("@/lib/binance.server");
        const r = await getDepositAddress(network!);
        if (r.ok) address = r.address;
      } catch {
        /* Binance can block the server (403) — fall through to the manual address */
      }
    }
    if (!address) {
      const label = network === "TRX" ? "USDT TRC-20" : "USDT BEP-20";
      await notifyAdmins(
        `⚠️ <b>${label} deposit address missing</b>\nA user tried to deposit but no wallet address is configured.\nAdd it in Dashboard → Settings → Binance Setup.`,
      );
      return {
        error: `${label} deposits are temporarily unavailable. Please use another payment method or contact support.`,
      };
    }
  }


  const { data: row, error } = await db
    .from("binance_deposits")
    .insert({
      telegram_id: chatId,
      kind,
      network: kind === "crypto" ? network : null,
      address,
      amount_usdt: amountUsdt,
      meta,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();
  if (error || !row) return { error: "Could not create the deposit. Please try again." };
  return { row };
}


function binanceView(row: any, settings: Record<string, string> = {}) {
  const head =
    row.kind === "payid"
      ? `${uiIconHtml(settings, "dep_pay_title")} <b>${escapeHtml(uiText(settings, "dep_pay_title"))}</b>\n\nOpen Binance app → <b>Pay</b> → <b>Send</b> → paste this Pay ID:\n<code>${row.address}</code>`
      : `${uiIconHtml(settings, "dep_net_title")} <b>${NETWORKS[row.network] ?? row.network}</b>\n\nSend USDT to this address on the <b>${row.network}</b> network only:\n<code>${row.address}</code>`;
  const text =
    `${head}\n\n` +
    `${uiTag(settings, "dep_amount")}:\n<code>${Number(row.amount_usdt).toFixed(4)}</code>\n\n` +
    `${uiIconHtml(settings, "dep_warn")} ${escapeHtml(uiText(settings, "dep_warn"))} — it is how we identify your payment.\n` +
    `${uiIconHtml(settings, "dep_timer")} ${escapeHtml(uiText(settings, "dep_timer"))}. After paying, tap <b>${escapeHtml(uiText(settings, "dep_verify"))}</b> — verification is automatic.`;
  const kb: Button[][] = [
    [uiBtn(settings, "dep_verify", `bchk:${row.id}`)],
    [uiUrlBtn(settings, "dep_support", (settings["support_link"] || "").trim() || DEFAULT_SUPPORT_LINK)],
    [uiBtn(settings, "dep_cancel", "wallet")],
  ];

  return { text, kb };
}

async function verifyBinanceDeposit(chatId: number, id: string) {
  const { data: row } = await db
    .from("binance_deposits")
    .select("*")
    .eq("id", id)
    .eq("telegram_id", chatId)
    .maybeSingle();
  const vs = await getSettings();
  if (!row) return { message: "❌ Deposit not found." };
  if (row.status === "credited") return { message: "✅ This deposit was already credited." };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.from("binance_deposits").update({ status: "expired" }).eq("id", id);
    return { message: "⌛ This deposit request expired. Please start a new one." };
  }

  const { findCryptoDeposit, findPayTransaction } = await import("@/lib/binance.server");
  const expected = Number(row.amount_usdt);
  const result =
    row.kind === "payid"
      ? await findPayTransaction(expected, txUsed)
      : await findCryptoDeposit(expected, row.network, txUsed);

  if (!result.ok) {
    return {
      message:
        `⏳ Payment not confirmed yet.\n\n` +
        `Make sure you sent exactly <b>${expected.toFixed(4)} USDT</b>. Payments can take a few minutes.\n\n` +
        `👉 Tap <b>${escapeHtml(uiText(vs, "dep_reverify"))}</b> in a minute. Still stuck? Contact support below.`,
      keyboard: [
        [uiBtn(vs, "dep_reverify", `bchk:${id}`)],
        [uiUrlBtn(vs, "dep_support", (vs["support_link"] || "").trim() || DEFAULT_SUPPORT_LINK)],
        [uiBtn(vs, "dep_wallet", "wallet")],
      ] as Button[][],

    };
  }


  const { error: usedErr } = await db.from("binance_used_txs").insert({ tx_id: result.txId });
  if (usedErr) return { message: "⏳ Payment not found yet. Please try again." };

  return await settlePayment(chatId, row, Number(result.amount), result.txId!, "Auto-verified via Binance API");
}

/** Credit a wallet deposit, or fulfil a direct checkout attached to the deposit row. */
async function settlePayment(chatId: number, row: any, amount: number, txid: string, note: string) {
  const methodLabel =
    row.kind === "paykori"
      ? `Pay Kori ${String(row.network || "").toUpperCase()}`
      : row.kind === "payid"
        ? "Binance Pay"
        : `USDT ${row.network}`;

  const methodKey =
    row.kind === "paykori" ? `paykori_${row.network}` : row.kind === "payid" ? "binance_pay" : `usdt_${row.network}`;

  const meta = (row.meta ?? {}) as any;

  await db.from("binance_deposits").update({ status: "credited", tx_id: txid }).eq("id", row.id);

  // Reseller wallet top-up — same gateways, different wallet.
  if (meta.reseller_id) {
    await db.rpc("reseller_adjust_balance", {
      _reseller_id: String(meta.reseller_id),
      _amount: amount,
      _type: "topup",
      _reference: txid,
      _note: `${methodLabel} — ${note}`,
    });
    await db.from("reseller_topups").insert({
      reseller_id: String(meta.reseller_id),
      amount,
      method: methodKey,
      txid,
      status: "approved",
      admin_note: `Auto-verified — ${methodLabel}`,
    });
    return {
      message: `🎉 Top-up confirmed: ${money(amount)} (${methodLabel})`,
      keyboard: [] as Button[][],
    };
  }
  await db.from("payment_requests").insert({
    telegram_id: chatId,
    method: methodLabel,
    amount,
    txid,
    status: "approved",
    admin_note: note,
  });

  if (Array.isArray(meta.items) && meta.items.length) {
    await db.from("transactions").insert({
      telegram_id: chatId,
      type: "deposit",
      amount,
      method: methodKey,
      reference: txid,
      note: "Direct checkout payment",
    });
    const fresh = await getUser(chatId);
    await db.from("bot_users").update({ balance: Number(fresh.balance) + amount }).eq("telegram_id", chatId);
    const res = await fulfillCheckout(chatId, meta, methodKey, txid);
    return { message: res.text, keyboard: res.kb };
  }

  const user = await getUser(chatId);
  await db.from("bot_users").update({ balance: Number(user.balance) + amount }).eq("telegram_id", chatId);
  await db.from("transactions").insert({
    telegram_id: chatId,
    type: "deposit",
    amount,
    method: methodKey,
    reference: txid,
    note,
  });

  const after = await getUser(chatId);
  return {
    message:
      `🎉 <b>Deposit confirmed!</b>\n──────────────\n` +
      `Method: ${methodLabel}\nAmount: <b>${money(amount)}</b>\n` +
      `TXID: <code>${escapeHtml(String(txid))}</code>\n` +
      `New balance: <b>${money(after?.balance)}</b>\n\n` +
      `<i>You can now pay for any product instantly with your wallet.</i>`,
    keyboard: [
      [uiBtn(await getSettings(), "com_wallet", "wallet")],
      [uiBtn(await getSettings(), "com_home", "home")],
    ] as Button[][],
  };
}

/* ------------------------------------------------------- Pay Kori (BDT) */
/*
 * bKash / Nagad / Rocket through the Pay Kori hosted checkout.
 * Anti-fraud: the bot never accepts a user-supplied "I paid" claim. Every
 * credit is decided by a server -> gateway `payment/verify` call, the paid
 * amount must cover the amount we requested, and each transaction id can only
 * be used once (unique row in `binance_used_txs`).
 */

async function paykoriCfg() {
  const s = await getSettings();
  const { paykoriConfig } = await import("@/lib/paykori.server");
  return { s, cfg: paykoriConfig(s) };
}

async function startPaykoriDeposit(
  chatId: number,
  method: string,
  usd: number,
  meta: Record<string, unknown> = {},
) {
  const { s, cfg } = await paykoriCfg();
  const { PAYKORI_METHODS, createPayment, usdToBdt } = await import("@/lib/paykori.server");
  if (!cfg.enabled || !PAYKORI_METHODS[method]) {
    return { error: "Mobile banking payments are currently unavailable. Please use another method." };
  }
  const amountUsd = Math.round(usd * 100) / 100;
  if (!(amountUsd > 0)) return { error: "Invalid amount." };
  const amountBdt = usdToBdt(amountUsd, cfg.rate);

  const { data: row, error } = await db
    .from("binance_deposits")
    .insert({
      telegram_id: chatId,
      kind: "paykori",
      network: method,
      address: null,
      amount_usdt: amountUsd,
      meta: { ...meta, gateway: "paykori", method, bdt: amountBdt, rate: cfg.rate },
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();
  if (error || !row) return { error: "Could not create the payment. Please try again." };

  const base = siteUrl(s);
  const created = await createPayment(cfg, {
    amountBdt,
    successUrl: `${base}/api/public/paykori/return?dep=${row.id}`,
    cancelUrl: `${base}/api/public/paykori/return?dep=${row.id}&cancel=1`,
    orderId: String(row.id),
    phone: undefined,
    email: undefined,
  });
  if (!created.ok) {
    await db.from("binance_deposits").update({ status: "failed" }).eq("id", row.id);
    await notifyAdmins(`⚠️ <b>Pay Kori create failed</b>\n${escapeHtml(created.error)}`);
    return { error: created.error };
  }

  const newMeta = { ...(row.meta as any), trx: created.transactionId ?? null, pay_url: created.url };
  await db.from("binance_deposits").update({ address: created.url, meta: newMeta }).eq("id", row.id);
  return { row: { ...row, address: created.url, meta: newMeta } };
}

function paykoriView(row: any, settings: Record<string, string>) {
  const meta = (row.meta ?? {}) as any;
  const label = String(row.network || "").toUpperCase();
  const bdt = Number(meta.bdt ?? 0);
  const text =
    `${uiIconHtml(settings, "dep_bdt_title")} <b>${escapeHtml(uiText(settings, "dep_bdt_title"))} — ${escapeHtml(label)}</b>\n\n` +
    `Amount: <b>৳${bdt.toFixed(2)}</b>  (${money(row.amount_usdt)})\n` +
    `Rate: 1 USD = ${Number(meta.rate ?? 0)} BDT\n\n` +
    `Tap <b>Pay now</b>, complete the payment with bKash / Nagad / Rocket, then come back — your wallet is credited automatically after the gateway confirms it.`;
  const kb: Button[][] = [
    [{ text: `💳 Pay now — ৳${bdt.toFixed(2)}`, url: String(row.address) } as any],
    [uiBtn(settings, "dep_verify", `pkchk:${row.id}`)],
    [uiUrlBtn(settings, "dep_support", (settings["support_link"] || "").trim() || DEFAULT_SUPPORT_LINK)],
    [uiBtn(settings, "dep_cancel", "wallet")],
  ];
  return { text, kb };
}

/** Verify with the gateway and credit exactly once. Returns a bot-ready message. */
async function creditPaykoriRow(row: any, transactionId: string) {
  const { cfg } = await paykoriCfg();
  const { verifyPayment, isPaid, bdtToUsd } = await import("@/lib/paykori.server");
  const v = await verifyPayment(cfg, transactionId);
  if (!v.ok) return { credited: false as const, message: `⏳ Could not verify yet: ${escapeHtml(v.error)}` };
  const info = v.info;
  if (!isPaid(info.status)) {
    return {
      credited: false as const,
      message: `⏳ Payment not confirmed yet (status: <b>${escapeHtml(info.status || "pending")}</b>). Complete the payment and try again in a minute.`,
    };
  }
  const expectedBdt = Number((row.meta ?? {}).bdt ?? 0);
  // Tolerate 1 BDT rounding, never accept an underpayment.
  if (expectedBdt > 0 && info.amount + 1 < expectedBdt) {
    await notifyAdmins(
      `⚠️ <b>Pay Kori underpayment</b>\nDeposit <code>${row.id}</code>\nExpected ৳${expectedBdt} · paid ৳${info.amount}`,
    );
    return {
      credited: false as const,
      message: `❌ We received ৳${info.amount} but this order needs ৳${expectedBdt.toFixed(2)}. Please contact support.`,
    };
  }

  // Single-use transaction id — blocks replay of the same TrxID.
  const txKey = `paykori:${info.transactionId ?? transactionId}`;
  const { error: usedErr } = await db.from("binance_used_txs").insert({ tx_id: txKey });
  if (usedErr) return { credited: false as const, message: "✅ This payment was already processed." };

  const rate = Number((row.meta ?? {}).rate ?? cfg.rate) || cfg.rate;
  const usd = Math.max(Number(row.amount_usdt), bdtToUsd(info.amount, rate));
  const r = await settlePayment(
    Number(row.telegram_id),
    row,
    Math.round(usd * 100) / 100,
    String(info.transactionId ?? transactionId),
    `Auto-verified via Pay Kori (${info.method || row.network})`,
  );
  return { credited: true as const, message: r.message, keyboard: r.keyboard };
}

async function verifyPaykoriDeposit(chatId: number, id: string) {
  const s = await getSettings();
  const back: Button[][] = [
    [uiBtn(s, "dep_verify", `pkchk:${id}`)],
    [uiUrlBtn(s, "dep_support", (s["support_link"] || "").trim() || DEFAULT_SUPPORT_LINK)],
    [uiBtn(s, "dep_wallet", "wallet")],
  ];
  const { data: row } = await db
    .from("binance_deposits")
    .select("*")
    .eq("id", id)
    .eq("telegram_id", chatId)
    .eq("kind", "paykori")
    .maybeSingle();
  if (!row) return { message: "❌ Payment not found.", keyboard: back };
  if (row.status === "credited") return { message: "✅ This payment was already credited.", keyboard: back };

  const trx = row.tx_id || (row.meta as any)?.trx;
  if (!trx) {
    return {
      message:
        "⏳ We have not received a confirmation from the gateway yet.\n\nFinish the payment on the Pay Kori page, then tap verify again in a minute.",
      keyboard: back,
    };
  }
  const r = await creditPaykoriRow(row, String(trx));
  return { message: r.message, keyboard: r.credited ? (r as any).keyboard : back };
}

/**
 * Entry point for the gateway webhook and the success redirect.
 * The payload is treated as an untrusted hint: only `transactionId` (and an
 * optional deposit id) are used, and the real status always comes from
 * `payment/verify`.
 */
export async function settlePaykoriTransaction(transactionId: string, depId?: string | null) {
  const tx = String(transactionId || "").trim();
  if (!tx) return { ok: false as const, reason: "missing transaction id" };

  let row: any = null;
  if (depId) {
    const { data } = await db.from("binance_deposits").select("*").eq("id", depId).eq("kind", "paykori").maybeSingle();
    row = data;
  }
  if (!row) {
    const { data } = await db
      .from("binance_deposits")
      .select("*")
      .eq("kind", "paykori")
      .or(`tx_id.eq.${tx},meta->>trx.eq.${tx}`)
      .maybeSingle();
    row = data;
  }
  if (!row) return { ok: false as const, reason: "deposit not found" };
  if (row.status === "credited") return { ok: true as const, already: true };

  if (!row.tx_id) await db.from("binance_deposits").update({ tx_id: tx }).eq("id", row.id);
  const r = await creditPaykoriRow({ ...row, tx_id: tx }, tx);
  if (r.credited) {
    if (Number(row.telegram_id) > 0) await sendMessage(Number(row.telegram_id), r.message, (r as any).keyboard);
    return { ok: true as const, credited: true };
  }
  return { ok: false as const, reason: r.message.replace(/<[^>]+>/g, "") };
}






/** User-supplied transaction id: auto-match against Binance, else queue for admin. */
async function submitBinanceTxid(chatId: number, depId: string, txid: string, username: string | null) {
  const back: Button[][] = [[uiBtn(await getSettings(), "com_wallet", "wallet")], [uiBtn(await getSettings(), "com_home", "home")]];
  if (!txid || txid.length < 6) {
    return { message: "❌ That does not look like a valid transaction ID. Please try again.", keyboard: back };
  }
  const { data: row } = await db
    .from("binance_deposits")
    .select("*")
    .eq("id", depId)
    .eq("telegram_id", chatId)
    .maybeSingle();
  if (!row) return { message: "❌ Deposit request not found. Please start again.", keyboard: back };
  if (row.status === "credited") return { message: "✅ This deposit was already credited.", keyboard: back };
  if (await txUsed(txid)) return { message: "❌ This transaction ID was already used.", keyboard: back };

  const expected = Number(row.amount_usdt);
  const method = row.kind === "payid" ? "Binance Pay" : `USDT ${row.network}`;

  let match: { ok: boolean; amount?: number; error?: string } = { ok: false };
  try {
    const { findByTxId } = await import("@/lib/binance.server");
    match = await findByTxId(txid);
  } catch {
    match = { ok: false };
  }

  if (match.ok && Math.abs(Number(match.amount) - expected) < 0.01) {
    const { error: usedErr } = await db.from("binance_used_txs").insert({ tx_id: txid });
    if (usedErr) return { message: "❌ This transaction ID was already used.", keyboard: back };
    const r = await settlePayment(chatId, row, Number(match.amount), txid, "Auto-approved — transaction ID matched");
    return { message: r.message, keyboard: r.keyboard };
  }

  const meta = (row.meta ?? {}) as any;
  const isOrder = Array.isArray(meta.items) && meta.items.length;

  await db.from("payment_requests").insert({
    telegram_id: chatId,
    method,
    amount: expected,
    txid,
    sender_info: username ? "@" + username : String(chatId),
    status: "pending",
  });
  await db.from("binance_deposits").update({ tx_id: txid }).eq("id", depId);
  await notifyAdmins(
    `💳 <b>${isOrder ? "Order payment" : "Binance deposit"} — manual check</b>\nUser: <code>${chatId}</code>\nMethod: ${method}\nAmount: <b>${expected.toFixed(4)} USDT</b>\nTXID: <code>${escapeHtml(txid)}</code>` +
      (isOrder ? `\nItems: ${escapeHtml(String(meta.summary ?? ""))}` : ""),
  );
  return {
    message: isOrder
      ? `🧾 Transaction ID received.\n\n⏳ <b>Your order is waiting for payment confirmation.</b>\nAn admin is verifying your payment — delivery will be sent here as soon as it is confirmed.\n\n<i>Order:</i> ${escapeHtml(String(meta.summary ?? ""))}\n<i>Amount:</i> <b>${expected.toFixed(4)} USDT</b>`
      : `🧾 Transaction ID received.\n\nWe could not match it automatically yet, so an admin will verify it shortly. ` +
        `You can also tap auto verify again in a few minutes.`,
    keyboard: back,
  };
}


/* --------------------------------------------- automatic payment verifier */

let lastSweep = 0;

/**
 * Scans every open Binance Pay / USDT deposit and settles the ones Binance has
 * already received — no admin action and no user tap needed.
 */
export async function sweepBinanceDeposits(force = false) {
  if (!force && Date.now() - lastSweep < 45_000) return { skipped: true, settled: 0 };
  lastSweep = Date.now();

  const nowIso = new Date().toISOString();
  const { data: rows } = await db
    .from("binance_deposits")
    .select("*")
    .neq("status", "credited")
    .neq("status", "expired")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(25);

  if (!rows?.length) return { skipped: false, settled: 0 };

  const { findCryptoDeposit, findPayTransaction, findByTxId } = await import("@/lib/binance.server");
  let settled = 0;

  for (const row of rows) {
    const expected = Number(row.amount_usdt);
    let txId: string | null = null;
    let amount = expected;

    // 1) If the user already gave us a TXID, confirm that exact transaction.
    if (row.tx_id && !(await txUsed(row.tx_id))) {
      const byId = await findByTxId(String(row.tx_id));
      if (byId.ok && Math.abs(Number(byId.amount) - expected) < 0.01) {
        txId = String(row.tx_id);
        amount = Number(byId.amount);
      }
    }

    // 2) Otherwise match by the unique amount in Binance Pay / deposit history.
    if (!txId) {
      const result =
        row.kind === "payid"
          ? await findPayTransaction(expected, txUsed)
          : await findCryptoDeposit(expected, row.network, txUsed);
      if (result.ok) {
        txId = result.txId;
        amount = Number(result.amount);
      }
    }

    if (!txId) continue;

    const { error: usedErr } = await db.from("binance_used_txs").insert({ tx_id: txId });
    if (usedErr) continue; // another worker took it

    const res = await settlePayment(
      Number(row.telegram_id),
      row,
      amount,
      txId,
      "Auto-verified via Binance API (background check)",
    );
    settled++;
    await db
      .from("payment_requests")
      .update({ status: "approved", admin_note: "Auto-verified via Binance API" })
      .eq("telegram_id", row.telegram_id)
      .eq("txid", txId)
      .eq("status", "pending");
    try {
      if (Number(row.telegram_id) > 0) await sendMessage(Number(row.telegram_id), res.message, res.keyboard);
    } catch {
      /* user blocked the bot */
    }
  }

  return { skipped: false, settled };
}

/* --------------------------------------------------- live channel posting */

/**
 * The bot's @username. Read from settings, otherwise resolved once from
 * Telegram (getMe) and stored so channel deep links always work.
 */
async function botUsername(settings: Record<string, string>): Promise<string> {
  const saved = (settings["bot_username"] || "").replace(/^@/, "").trim();
  if (saved) return saved;
  try {
    const me = await getMe();
    const uname = String(me?.result?.username || "").trim();
    if (uname) {
      await upsertSetting({ key: "bot_username", value: uname }, { onConflict: "key" });
      settings["bot_username"] = uname;
      invalidateSettings();
      return uname;
    }
  } catch {
    /* fall through */
  }
  return "";
}

/** Deep link that opens this product straight inside the bot. */
async function productDeepLink(settings: Record<string, string>, productId: string) {
  const uname = await botUsername(settings);
  if (!uname) return null;
  return `https://t.me/${uname}?start=p_${productId}`;
}

/** Big green "open product" button under every channel post. */
async function channelProductButton(
  settings: Record<string, string>,
  product: any,
): Promise<Button[][] | undefined> {
  const url = await productDeepLink(settings, product.id);
  if (!url) return undefined;
  const { customId, glyph } = productIcon(product);
  const label = customId ? String(product.name) : `${glyph} ${product.name}`;
  return [
    [
      {
        text: `🛒 Buy ${label}`,
        url,
        ...(customId ? { icon_custom_emoji_id: customId } : {}),
      },
    ],
  ];
}

/** Send a post to the configured sales/stock channel (banner when available). */
async function postToChannel(
  settings: Record<string, string>,
  text: string,
  kb?: Button[][],
  photo?: string | null,
) {
  const chat = settings["announce_chat_id"];
  if (!chat) return { sent: false, reason: "No announcement channel/group ID configured" };
  if (photo) {
    const photoResult = await sendPhoto(chat, photo, text, kb);
    if (photoResult.ok) return { sent: true };
  }
  const messageResult = await sendMessage(chat, text, kb);
  if (!messageResult.ok) {
    throw new Error(`Telegram channel post failed: ${messageResult.description ?? "Unknown Telegram error"}`);
  }
  return { sent: true };
}


/**
 * Send the same announcement card to every bot user in DM.
 * Channel posts alone don't reach people who never joined the channel, so
 * restock / new-product cards are mirrored into the bot chat as well.
 * Toggle with the `announce_dm` setting (default ON).
 */
async function dmAllBotUsers(
  settings: Record<string, string>,
  text: string,
  kb?: Button[][],
  photo?: string | null,
  skip: Set<number> = new Set(),
  page?: { after: number; limit: number; beforeSend?: (cursor: number) => Promise<void> },
) {
  if ((settings["announce_dm"] ?? "on").toLowerCase() === "off") {
    return { sent: 0, total: 0, complete: true, nextCursor: page?.after ?? 0 };
  }
  let query = db
    .from("bot_users")
    .select("telegram_id,is_banned")
    .eq("is_banned", false)
    .gt("telegram_id", page?.after ?? 0)
    .order("telegram_id", { ascending: true });
  if (page) query = query.limit(page.limit + 1);
  const { data, error } = await query;
  if (error) {
    console.error("dmAllBotUsers: could not load users:", error.message);
    throw new Error(`Could not load bot users: ${error.message}`);
  }
  const eligible = (data ?? []).filter(
    (u: any) => !u.is_banned && Number(u.telegram_id) > 1_000_000 && !skip.has(Number(u.telegram_id)),
  );
  const complete = !page || eligible.length <= page.limit;
  const targets = page ? eligible.slice(0, page.limit) : eligible;
  let sent = 0;
  for (const user of targets) {
    // Telegram has no idempotency key for sendMessage/sendPhoto. Reserve this
    // recipient before the API call so a worker restart can never DM them twice.
    if (page?.beforeSend) await page.beforeSend(Number(user.telegram_id));
    let delivered = false;
    if (photo) {
      const photoResult = await sendPhoto(user.telegram_id, photo, text, kb);
      delivered = photoResult.ok;
    }
    if (!delivered) delivered = (await sendMessage(user.telegram_id, text, kb)).ok;
    if (delivered) sent += 1;
  }
  return {
    sent,
    total: targets.length,
    complete,
    nextCursor: targets.length ? Number(targets[targets.length - 1]?.telegram_id ?? page?.after ?? 0) : (page?.after ?? 0),
  };
}

function fillTokens(tpl: string, map: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => map[k] ?? m);
}

export async function announcePurchase(user: any, product: any, qty: number) {
  const s = await getSettings();
  if (!s["announce_chat_id"] || (s["announce_sales"] ?? "on").toLowerCase() === "off") return;
  const tpl = s["announce_sale_text"] || "User {user} just bought {qty}× {product}!";
  const text = fillTokens(escapeHtml(tpl), {
    user: escapeHtml(maskUsername(user?.username, user?.first_name)),
    qty: String(qty),
    price: money(product?.price),
    product: `${productIconHtml(product)} <b>${escapeHtml(String(product?.name ?? ""))}</b>`,
  });
  await postToChannel(s, text, await channelProductButton(s, product));
}

/** "User X just claimed free …" post for freebies / gift drops. */
export async function announceClaim(user: any, product: any) {
  const s = await getSettings();
  if (!s["announce_chat_id"] || (s["announce_sales"] ?? "on").toLowerCase() === "off") return;
  const tpl = s["announce_claim_text"] || "User {user} just claimed free {product}.";
  const text = fillTokens(escapeHtml(tpl), {
    user: escapeHtml(maskUsername(user?.username, user?.first_name)),
    product: `${productIconHtml(product)} <b>${escapeHtml(String(product?.name ?? ""))}</b>`,
  });
  await postToChannel(s, text, await channelProductButton(s, product));
}

/** "BACK IN STOCK" card — posted to the channel AND DM'd to every bot user. */
export async function announceRestock(
  product: any,
  addedQty: number,
  available: number,
  skipDm: Set<number> = new Set(),
  delivery?: {
    channelSent?: boolean;
    dmAfter?: number;
    dmLimit?: number;
    beforeChannelSend?: () => Promise<void>;
    beforeDmSend?: (cursor: number) => Promise<void>;
  },
) {
  const s = await getSettings();
  if ((s["announce_restock"] ?? "on").toLowerCase() === "off") return;
  const title = s["announce_restock_title"] || "BACK IN STOCK";
  const footer =
    s["announce_restock_footer"] || "Restocked units go fast — lock yours in before they're gone again.";
  const line = "━━━━━━━━━━━━━━━━";
  const text =
    `${alertIcon(s, "restock")} <b>${escapeHtml(title)}</b>\n${line}\n\n` +
    `${productIconHtml(product)} <b>${escapeHtml(String(product?.name ?? ""))}</b>\n\n` +
    (addedQty > 0
      ? `${alertIcon(s, "spark")} <b>${addedQty}</b> fresh unit(s) just landed.\n`
      : `${alertIcon(s, "spark")} Available again right now.\n`) +
    `${alertIcon(s, "price")} <b>Price</b>  ${money(product?.price)}\n` +
    `${alertIcon(s, "stock")} <b>In stock</b>  ${available} ready\n` +
    `${alertIcon(s, "delivery")} <b>Delivery</b>  instant &amp; automatic\n\n` +
    `<i>${escapeHtml(footer)}</i>`;

  const kb = await channelProductButton(s, product);
  const banner = bannerFor(product, s);
  if (!delivery?.channelSent && delivery?.beforeChannelSend) await delivery.beforeChannelSend();
  const channel = delivery?.channelSent
    ? { sent: true }
    : await postToChannel(s, text, kb, banner).catch((error) => {
        console.error("Restock channel delivery failed:", error);
        return { sent: false, reason: error instanceof Error ? error.message : String(error) };
      });
  if (!channel.sent) throw new Error(channel.reason ?? "Restock channel delivery failed");
  const dmKb: Button[][] = [[uiBtn(s, "prod_restock_view", `p:${product?.id}`)]];
  const dm = await dmAllBotUsers(
    s,
    text,
    dmKb,
    banner,
    skipDm,
    delivery
      ? {
          after: delivery.dmAfter ?? 0,
          limit: delivery.dmLimit ?? 40,
          ...(delivery.beforeDmSend ? { beforeSend: delivery.beforeDmSend } : {}),
        }
      : undefined,
  );
  return { channel: channel.sent, dmSent: dm.sent, dmTotal: dm.total, dmComplete: dm.complete, dmCursor: dm.nextCursor };
}

/**
 * "NEW PRODUCT" card posted to the channel the moment a product goes live
 * (admin flips a supplier product ON). Unlisted products never reach here —
 * they only surface in the admin bell so the admin can decide first.
 */
export async function announceNewProduct(
  product: any,
  delivery?: {
    channelSent?: boolean;
    dmAfter?: number;
    dmLimit?: number;
    beforeChannelSend?: () => Promise<void>;
    beforeDmSend?: (cursor: number) => Promise<void>;
  },
) {
  const s = await getSettings();
  if ((s["announce_new"] ?? "on").toLowerCase() === "off") return;
  const title = s["announce_new_title"] || "JUST ADDED";
  const footer = s["announce_new_footer"] || "First come, first served — early buyers get the best stock.";
  const line = "━━━━━━━━━━━━━━━━";
  const stock = Number(product?.supplier_stock ?? product?.stock ?? 0);
  const text =
    `${alertIcon(s, "new")} <b>${escapeHtml(title)}</b>\n${line}\n\n` +
    `${productIconHtml(product)} <b>${escapeHtml(String(product?.name ?? ""))}</b>\n\n` +
    `${alertIcon(s, "spark")} Brand new in the store.\n` +
    `${alertIcon(s, "price")} <b>Price</b>  ${money(product?.price)}\n` +
    (stock > 0 ? `${alertIcon(s, "stock")} <b>In stock</b>  ${stock} ready\n` : "") +
    `${alertIcon(s, "delivery")} <b>Delivery</b>  instant &amp; automatic\n` +
    `\n<i>${escapeHtml(footer)}</i>`;

  const banner = bannerFor(product, s);
  if (!delivery?.channelSent && delivery?.beforeChannelSend) await delivery.beforeChannelSend();
  const channel = delivery?.channelSent
    ? { sent: true }
    : await postToChannel(s, text, await channelProductButton(s, product), banner).catch((error) => {
        console.error("New-product channel delivery failed:", error);
        return { sent: false, reason: error instanceof Error ? error.message : String(error) };
      });
  if (!channel.sent) throw new Error(channel.reason ?? "New-product channel delivery failed");
  const dmKb: Button[][] = [[uiBtn(s, "prod_restock_view", `p:${product?.id}`)]];
  const dm = await dmAllBotUsers(
    s,
    text,
    dmKb,
    banner,
    new Set(),
    delivery
      ? {
          after: delivery.dmAfter ?? 0,
          limit: delivery.dmLimit ?? 40,
          ...(delivery.beforeDmSend ? { beforeSend: delivery.beforeDmSend } : {}),
        }
      : undefined,
  );
  return { channel: channel.sent, dmSent: dm.sent, dmTotal: dm.total, dmComplete: dm.complete, dmCursor: dm.nextCursor };
}

/**
 * "LOW STOCK" / "OUT OF STOCK" card — posted when a supplier's stock for a
 * listed product falls to (or below) the alert threshold. Toggle with the
 * `announce_low` setting (default ON), threshold `announce_low_threshold`.
 */
export async function announceLowStock(
  product: any,
  available: number,
  delivery?: {
    channelSent?: boolean;
    dmAfter?: number;
    dmLimit?: number;
    beforeChannelSend?: () => Promise<void>;
    beforeDmSend?: (cursor: number) => Promise<void>;
  },
) {
  const s = await getSettings();
  if ((s["announce_low"] ?? "on").toLowerCase() === "off") return;
  const out = available <= 0;
  const title = out
    ? s["announce_out_title"] || "SOLD OUT"
    : s["announce_low_title"] || "ALMOST GONE";
  const footer = out
    ? s["announce_out_footer"] || "Sold out for now — you'll be the first to know the moment it returns."
    : s["announce_low_footer"] || "This is your final chance — secure it before it's gone for good.";
  const line = "━━━━━━━━━━━━━━━━";
  const text =
    `${alertIcon(s, out ? "out" : "low")} <b>${escapeHtml(title)}</b>\n${line}\n\n` +
    `${productIconHtml(product)} <b>${escapeHtml(String(product?.name ?? ""))}</b>\n\n` +
    (out
      ? `${alertIcon(s, "stock")} <b>Stock</b>  none left\n`
      : `${alertIcon(s, "stock")} <b>Only ${available} left</b> in stock\n`) +
    `${alertIcon(s, "price")} <b>Price</b>  ${money(product?.price)}\n` +
    (out
      ? `${alertIcon(s, "bell")} We'll post again the second it's restocked\n`
      : `${alertIcon(s, "delivery")} <b>Delivery</b>  instant &amp; automatic\n`) +
    `\n<i>${escapeHtml(footer)}</i>`;

  const banner = bannerFor(product, s);
  if (!delivery?.channelSent && delivery?.beforeChannelSend) await delivery.beforeChannelSend();
  const channel = delivery?.channelSent
    ? { sent: true }
    : await postToChannel(s, text, await channelProductButton(s, product), banner).catch((error) => {
        console.error("Low-stock channel delivery failed:", error);
        return { sent: false, reason: error instanceof Error ? error.message : String(error) };
      });
  if (!channel.sent) throw new Error(channel.reason ?? "Low-stock channel delivery failed");
  const dmKb: Button[][] = [[uiBtn(s, "prod_restock_view", `p:${product?.id}`)]];
  const dm = await dmAllBotUsers(
    s,
    text,
    dmKb,
    banner,
    new Set(),
    delivery
      ? {
          after: delivery.dmAfter ?? 0,
          limit: delivery.dmLimit ?? 40,
          ...(delivery.beforeDmSend ? { beforeSend: delivery.beforeDmSend } : {}),
        }
      : undefined,
  );
  return { channel: channel.sent, dmSent: dm.sent, dmTotal: dm.total, dmComplete: dm.complete, dmCursor: dm.nextCursor };
}

/**
 * "PRICE DROP" / "PRICE UPDATE" card — posted when a listed product's selling
 * price actually changes. Toggle with `announce_price` (default ON); price
 * rises can be silenced separately with `announce_price_up` (default OFF).
 */
export async function announcePriceChange(
  product: any,
  oldPrice: number,
  newPrice: number,
  delivery?: {
    channelSent?: boolean;
    dmAfter?: number;
    dmLimit?: number;
    beforeChannelSend?: () => Promise<void>;
    beforeDmSend?: (cursor: number) => Promise<void>;
  },
) {
  const s = await getSettings();
  if ((s["announce_price"] ?? "on").toLowerCase() === "off") return { channel: true, dmComplete: true, dmCursor: 0 };
  const down = Number(newPrice) < Number(oldPrice);
  if (!down && (s["announce_price_up"] ?? "off").toLowerCase() !== "on") {
    return { channel: true, dmComplete: true, dmCursor: 0 };
  }
  const title = down
    ? s["announce_price_down_title"] || "PRICE DROP"
    : s["announce_price_up_title"] || "PRICE UPDATE";
  const footer = down
    ? s["announce_price_down_footer"] || "Limited-time pricing — it can go back up as soon as supply tightens."
    : s["announce_price_up_footer"] || "Pricing for this product has just been updated.";
  const line = "━━━━━━━━━━━━━━━━";
  const saved = Math.max(0, Number(oldPrice) - Number(newPrice));
  const percent = Number(oldPrice) > 0 ? Math.round((saved / Number(oldPrice)) * 100) : 0;
  const text =
    `${alertIcon(s, down ? "price_down" : "price_up")} <b>${escapeHtml(title)}</b>\n${line}\n\n` +
    `${productIconHtml(product)} <b>${escapeHtml(String(product?.name ?? ""))}</b>\n\n` +
    `${alertIcon(s, "price")} <b>Was</b>  <s>${money(oldPrice)}</s>\n` +
    `${alertIcon(s, "spark")} <b>Now</b>  ${money(newPrice)}\n` +
    (down && saved > 0 ? `${alertIcon(s, "save")} <b>You save</b>  ${money(saved)}${percent > 0 ? ` (${percent}% off)` : ""}\n` : "") +
    `${alertIcon(s, "delivery")} <b>Delivery</b>  instant &amp; automatic\n` +
    `\n<i>${escapeHtml(footer)}</i>`;

  const banner = bannerFor(product, s);
  if (!delivery?.channelSent && delivery?.beforeChannelSend) await delivery.beforeChannelSend();
  const channel = delivery?.channelSent
    ? { sent: true }
    : await postToChannel(s, text, await channelProductButton(s, product), banner).catch((error) => {
        console.error("Price-change channel delivery failed:", error);
        return { sent: false, reason: error instanceof Error ? error.message : String(error) };
      });
  if (!channel.sent) throw new Error((channel as any).reason ?? "Price-change channel delivery failed");
  const dmKb: Button[][] = [[uiBtn(s, "prod_restock_view", `p:${product?.id}`)]];
  const dm = await dmAllBotUsers(
    s,
    text,
    dmKb,
    banner,
    new Set(),
    delivery
      ? {
          after: delivery.dmAfter ?? 0,
          limit: delivery.dmLimit ?? 40,
          ...(delivery.beforeDmSend ? { beforeSend: delivery.beforeDmSend } : {}),
        }
      : undefined,
  );
  return { channel: channel.sent, dmSent: dm.sent, dmTotal: dm.total, dmComplete: dm.complete, dmCursor: dm.nextCursor };
}

/**
 * "REMOVED" card — posted when an admin deletes a product that was live.
 * Uses the same channel + bot DM fan-out as the other stock cards.
 */
export async function announceProductRemoved(product: any) {
  const s = await getSettings();
  if ((s["announce_removed"] ?? "on").toLowerCase() === "off") return;
  const title = s["announce_removed_title"] || "🗑️ REMOVED";
  const footer = s["announce_removed_footer"] || "This product is no longer available in the store.";
  const line = "──────────────────────";
  const text =
    `<b>${escapeHtml(title)}</b>\n${line}\n\n` +
    `${productIconHtml(product)} <b>${escapeHtml(String(product?.name ?? ""))}</b>\n\n` +
    `<i>${escapeHtml(footer)}</i>`;
  await postToChannel(s, text).catch((error) => {
    console.error("Removed-product channel delivery failed:", error);
    return { sent: false };
  });
  await dmAllBotUsers(s, text).catch((error) => {
    console.error("Removed-product DM delivery failed:", error);
  });
}









/* ------------------------------------------------------------- dispatchers */

export async function handleUpdate(update: any) {
  // Warm the settings cache while the rest of the handler starts.
  void getSettings();
  // Payment sweep + all bookkeeping run after the user already got a reply.
  defer(() => sweepBinanceDeposits().catch(() => {}));
  try {
    if (update.callback_query) return await handleCallback(update.callback_query);
    const msg = update.message ?? update.edited_message;
    if (msg) return await handleMessage(msg);
  } finally {
    await flushBackground();
  }
}

async function handleMessage(msg: any) {
  if (!msg.from || msg.chat?.type !== "private") return;
  const chatId = msg.chat.id as number;
  const text: string = msg.text ?? msg.caption ?? "";
  const payload = text.startsWith("/start ") ? text.slice(7).trim() : undefined;
  const user = await upsertUser(msg.from, payload);
  if (!user) return;
  if (user.is_banned) {
    await sendMessage(chatId, "🚫 Your account has been banned.");
    return;
  }
  defer(() => trackMessage(chatId, msg.message_id));

  if (text.startsWith("/start")) {
    await setState(chatId, { msgs: (user.state as any)?.msgs ?? [] });
    const gateSettings = await getSettings();
    if (joinGateOn(gateSettings) && !(await isAdmin(chatId, gateSettings))) {
      const missing = await missingJoins(chatId, gateSettings);
      if (missing.length) {
        const gv = joinGateView(gateSettings, missing);
        await say(chatId, gv.text, gv.kb);
        return;
      }
    }
    // Deep link from a channel post: /start p_<product-id> opens that product.
    if (payload?.startsWith("p_")) {
      const view = await productView(payload.slice(2));
      if (view) {
        await showView(chatId, undefined, view);
        return;
      }
    }
    const fresh = await getUser(chatId);
    await say(chatId, await homeText(fresh), homeKeyboard(await getSettings()));
    return;
  }

  // shortcut commands
  if (
    /^\/(menu|products|wallet|api|support)\b/.test(
      text,
    )
  ) {
    const cmd = text.slice(1).split(/[\s@]/)[0] ?? "";
    const fresh = await getUser(chatId);
    if (cmd === "api") {
      const v = await apiPanelView(fresh);
      await say(chatId, v.text, v.kb);
    } else if (cmd === "menu") {
      await say(chatId, await homeText(fresh), homeKeyboard(await getSettings()));
    } else if (cmd === "products") {
      const v = await shopView(0);
      await say(chatId, v.text, v.kb);
    } else if (cmd === "wallet") {
      const v = await walletView(fresh);
      await say(chatId, v.text, v.kb);
    } else {
      const v = await supportView();
      await say(chatId, v.text, v.kb);
    }
    return;
  }


  if (text.startsWith("/admin")) {
    if (!(await isAdmin(chatId))) {
      await say(chatId, "⛔ You are not an admin.");
      return;
    }
    await say(chatId, await adminStatsText(), adminKeyboard());
    return;
  }

  // state machine
  const state = (user.state ?? {}) as any;
  if (state.awaiting === "sup_new" || state.awaiting === "sup_reply" || state.awaiting === "adm_tk_reply") {
    const kind = String(state.awaiting);
    state.awaiting = null;
    await setState(chatId, state);
    const body = text.trim();
    if (!body) {
      await say(chatId, "❌ Please send a text message.", [[{ text: "⬅️ Support", callback_data: "support" }]]);
      return;
    }
    if (kind === "sup_new") {
      const t = await createTicket(await getUser(chatId), body);
      await say(
        chatId,
        t
          ? `✅ <b>Ticket ${ticketCode(t.ticket_no)} created.</b>\nOur team will reply here in this chat.`
          : "❌ Could not create the ticket. Please try again.",
        [[{ text: "🎫 My Tickets", callback_data: "sup:list" }], [{ text: "🏠 Home", callback_data: "home" }]],
      );
      return;
    }
    if (kind === "sup_reply") {
      await postTicketReply(String(state.sup_ticket), "user", body, (await getUser(chatId))?.username ?? undefined);
      const v = await ticketView(String(state.sup_ticket), "user");
      await say(chatId, `✅ Reply sent.\n\n${v.text}`, v.kb);
      return;
    }
    if (!(await isAdmin(chatId))) return;
    await postTicketReply(String(state.adm_ticket), "admin", body, "Support");
    const v = await ticketView(String(state.adm_ticket), "admin");
    await say(chatId, `✅ Reply delivered to the customer.\n\n${v.text}`, v.kb);
    return;
  }
  if (state.awaiting === "api_topup" || state.awaiting === "api_alert") {
    await handleApiState(chatId, String(state.awaiting), text, state);
    return;
  }
  if (state.awaiting === "adm_api_icon") {
    await handleApiIconState(chatId, msg, text, state);
    return;
  }
  switch (state.awaiting) {
    case "pk_amount": {
      const amount = Number(text.replace(/[^0-9.]/g, ""));
      if (!amount || amount <= 0) {
        await say(chatId, "❌ Please send a valid amount in USD, e.g. <code>5</code>");
        return;
      }
      const pkMethod = String(state.pk_method || "bkash");
      state.awaiting = null;
      await setState(chatId, state);
      const pr = await startPaykoriDeposit(chatId, pkMethod, amount);
      if ("error" in pr && pr.error) {
        await say(chatId, `❌ ${escapeHtml(pr.error)}`, [[{ text: "⬅️ Wallet", callback_data: "wallet" }]]);
        return;
      }
      const pv = paykoriView((pr as any).row, await getSettings());
      await say(chatId, pv.text, pv.kb);
      return;
    }
    case "bin_amount": {

      const amount = Number(text.replace(/[^0-9.]/g, ""));
      if (!amount || amount <= 0) {
        await say(chatId, "❌ Please send a valid amount, e.g. <code>10</code>");
        return;
      }
      const kind = state.bin_kind === "crypto" ? "crypto" : "payid";
      state.awaiting = null;
      await setState(chatId, state);
      const r = await startBinanceDeposit(chatId, kind, amount, state.bin_network);
      if ("error" in r && r.error) {
        await say(chatId, `❌ ${escapeHtml(r.error)}`, [[{ text: "⬅️ Wallet", callback_data: "wallet" }]]);
        return;
      }
      const view = binanceView((r as any).row, await getSettings());
      await say(chatId, view.text, view.kb);
      return;
    }
    case "bin_txid": {
      const txid = text.trim();
      state.awaiting = null;
      await setState(chatId, state);
      const r = await submitBinanceTxid(chatId, state.bin_dep_id, txid, msg.from.username ?? null);
      await say(chatId, r.message, r.keyboard);
      return;
    }
    case "deposit_amount": {

      const amount = Number(text.replace(/[^0-9.]/g, ""));
      if (!amount || amount <= 0) {
        await say(chatId, "❌ Please send a valid amount, e.g. <code>10</code>");
        return;
      }
      state.amount = amount;
      state.awaiting = "deposit_txid";
      await setState(chatId, state);
      await say(chatId, "🧾 Now send the <b>TXID / sender number</b> of your payment.");
      return;
    }
    case "deposit_txid": {
      await db.from("payment_requests").insert({
        telegram_id: chatId,
        method: state.method,
        amount: state.amount,
        txid: text.trim(),
        sender_info: msg.from.username ? "@" + msg.from.username : String(chatId),
      });
      state.awaiting = null;
      await setState(chatId, state);
      await say(chatId, "✅ Payment request submitted. An admin will verify it shortly.", [
        [uiBtn(await getSettings(), "com_home", "home")],
      ]);
      await notifyAdmins(
        `💳 <b>New deposit request</b>\nUser: <code>${chatId}</code>\nMethod: ${state.method}\nAmount: ${money(state.amount)}\nTXID: <code>${text.trim()}</code>`,
      );
      return;
    }
    case "redeem": {
      const code = text.trim().toUpperCase();
      state.awaiting = null;
      await setState(chatId, state);
      // Single atomic claim — the same code can never be redeemed twice.
      const { data: claim, error: claimError } = await db.rpc("redeem_code_claim", {
        _code: code,
        _telegram_id: chatId,
      });
      if (claimError || !claim || !(claim as any).ok) {
        await say(chatId, "❌ Invalid or already used code.", [[uiBtn(await getSettings(), "com_home", "home")]]);
        return;
      }
      const rc = { amount: Number((claim as any).amount ?? 0) };
      await say(chatId, `🎉 Code redeemed! ${money(rc.amount)} added to your balance.`, [

        [uiBtn(await getSettings(), "com_wallet", "wallet")],
        [uiBtn(await getSettings(), "com_home", "home")],
      ]);
      return;
    }
    case "custom_qty": {
      const qty = parseInt(text.replace(/\D/g, ""), 10);
      state.awaiting = null;
      await setState(chatId, state);
      if (!qty || qty < 1) {
        await say(chatId, "❌ Invalid quantity.");
        return;
      }
      const view = await startCheckout(chatId, [{ product_id: state.product_id, qty }]);
      if (view) await say(chatId, view.text, view.kb);
      return;
    }
    case "coupon": {
      const code = text.trim().toUpperCase();
      state.awaiting = null;
      await setState(chatId, state);
      const meta = await readCo(chatId);
      if (!meta) {
        await say(chatId, "🧺 Nothing to check out.", [[uiBtn(await getSettings(), "com_shop", "shop:0")]]);
        return;
      }
      const { data: c } = await db
        .from("coupons")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();
      const expired = c?.expires_at && new Date(c.expires_at).getTime() < Date.now();
      const exhausted = c && Number(c.max_uses) > 0 && Number(c.used_count) >= Number(c.max_uses);
      if (!c || expired || exhausted) {
        await say(chatId, "❌ Invalid, expired or already used coupon code.", [
          [{ text: "⬅️ Back to checkout", callback_data: "co" }],
        ]);
        return;
      }
      meta.coupon = { code: c.code, percent: Number(c.percent), amount_off: Number(c.amount_off) };
      await writeCo(chatId, meta);
      const view = await coView(chatId);
      await say(chatId, `✅ Coupon <code>${escapeHtml(c.code)}</code> applied!\n\n${view.text}`, view.kb);
      return;
    }

    case "broadcast": {
      state.awaiting = null;
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      // photo (largest size) or document image, caption already captured in `text`
      const photoId: string | undefined =
        (Array.isArray(msg.photo) && msg.photo.length
          ? msg.photo[msg.photo.length - 1]?.file_id
          : undefined) ??
        (String(msg.document?.mime_type ?? "").startsWith("image/") ? msg.document?.file_id : undefined);

      if (!photoId && !text.trim()) {
        await say(chatId, "❌ Send text or a photo (caption optional) to broadcast.");
        return;
      }

      const { runBroadcast } = await import("@/lib/bot/broadcast.server");
      const result = await runBroadcast({ text, ...(photoId ? { photo: photoId } : {}) });
      await say(
        chatId,
        `📢 Broadcast ${photoId ? "(with image) " : ""}sent to ${result.sent}/${result.total} users.` +
          (result.failed ? `\n⚠️ Failed: ${result.failed}` : "") +
          (result.error ? `\n🛠 ${escapeHtml(result.error)}` : ""),
      );
      return;
    }

    case "addbal": {
      state.awaiting = null;
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const [idPart, amountPart] = text.trim().split(/\s+/);
      const targetId = Number(idPart);
      const amount = Number(amountPart);
      if (!targetId || !amount) {
        await say(chatId, "❌ Format: <code>123456789 10</code>");
        return;
      }
      const target = await getUser(targetId);
      if (!target) {
        await say(chatId, "❌ User not found.");
        return;
      }
      await db
        .from("bot_users")
        .update({ balance: Number(target.balance) + amount })
        .eq("telegram_id", targetId);
      await db.from("transactions").insert({
        telegram_id: targetId,
        type: "admin",
        amount,
        note: "Admin balance adjustment",
      });
      await say(chatId, `✅ Added ${money(amount)} to ${targetId}.`);
      await sendMessage(targetId, `💰 An admin added ${money(amount)} to your balance.`);
      return;
    }
    case "adm_ann_chat": {
      state.awaiting = null;
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const value = text.trim() === "-" ? "" : text.trim();
      await upsertSetting({ key: "announce_chat_id", value }, { onConflict: "key" });
      const v = await admAnnounceView();
      await say(chatId, `✅ Saved.\n\n${v.text}`, v.kb);
      return;
    }
    case "adm_jg_add": {
      state.awaiting = null;
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const line = text.trim();
      if (line && line !== "-") {
        const s = await getSettings();
        const current = (s["join_channels"] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
        current.push(line);
        await upsertSetting({ key: "join_channels", value: current.join("\n") }, { onConflict: "key" });
      }
      const jv = await admJoinGateView();
      await say(chatId, `✅ Saved.\n\n${jv.text}`, jv.kb);
      return;
    }
    case "adm_ann_post": {
      state.awaiting = null;
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const s = await getSettings();
      if (!s["announce_chat_id"]) {
        await say(chatId, "⚠️ Set the channel/group ID first.", [[{ text: "⬅️ Back", callback_data: "adm:ann" }]]);
        return;
      }
      const photo = msg?.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
      await postToChannel(s, text.trim() ? escapeHtml(text.trim()) : "", undefined, photo);
      await say(chatId, "✅ Announcement posted.", [[{ text: "⬅️ Back", callback_data: "adm:ann" }]]);
      return;
    }
    case "adm_pick_search": {
      const kind = (state.adm_pick_kind ?? "icon") as PickKind;
      const q = text.trim();
      state.awaiting = null;
      state.adm_pick_q = { ...(state.adm_pick_q ?? {}), [kind]: q };
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const v = await admPickView(kind, 0, q);
      await say(chatId, v.text, v.kb);
      return;
    }
    case "adm_find": {

      state.awaiting = null;
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const q = text.trim().replace(/^@/, "");
      let targetId = Number(q);
      if (!targetId) {
        const { data: found } = await db
          .from("bot_users")
          .select("telegram_id")
          .ilike("username", q)
          .maybeSingle();
        targetId = Number(found?.telegram_id ?? 0);
      }
      if (!targetId) {
        await say(chatId, "❌ User not found. Send a telegram ID or @username.", ADM_BACK);
        return;
      }
      const v = await admUserView(targetId);
      await say(chatId, v.text, v.kb);
      return;
    }
    case "adm_addbal_user": {
      state.awaiting = null;
      const targetId = Number(state.adm_target);
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const amount = Number(text.replace(/[^0-9.-]/g, ""));
      const target = await getUser(targetId);
      if (!amount || !target) {
        await say(chatId, "❌ Invalid amount or user.", ADM_BACK);
        return;
      }
      await db
        .from("bot_users")
        .update({ balance: Number(target.balance) + amount })
        .eq("telegram_id", targetId);
      await db
        .from("transactions")
        .insert({ telegram_id: targetId, type: "admin", amount, note: "Admin balance adjustment" });
      await sendMessage(targetId, `💰 An admin updated your balance by ${money(amount)}.`);
      const v = await admUserView(targetId);
      await say(chatId, `✅ Done.\n\n${v.text}`, v.kb);
      return;
    }
    case "adm_msg_user": {
      state.awaiting = null;
      const targetId = Number(state.adm_target);
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      await sendMessage(targetId, `📩 <b>Message from admin</b>\n\n${escapeHtml(text)}`);
      await say(chatId, "✅ Message sent.", ADM_BACK);
      return;
    }
    case "adm_deliver": {
      state.awaiting = null;
      const orderId = String(state.adm_order ?? "");
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const { data: o } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!o) {
        await say(chatId, "❌ Order not found.", ADM_BACK);
        return;
      }
      await db
        .from("orders")
        .update({ status: "completed", delivered_content: text })
        .eq("id", orderId);
      const parts = parseStock(text, "auto");
      const items = parts.length ? parts : [text];
      for (let i = 0; i < items.length; i++) {
        await sendMessage(
          o.telegram_id,
          `📦 <b>${escapeHtml(o.product_name)} — ${i + 1} of ${items.length}</b>\nOrder #${o.order_no}\n` +
            `<pre>${escapeHtml(items[i]!)}</pre>`,
        );
      }
      await sendMessage(
        o.telegram_id,
        `📦 <b>Order #${o.order_no} delivered!</b>\n\n<pre>${escapeHtml(text)}</pre>`,
      );
      await say(chatId, `✅ Order #${o.order_no} delivered.`, ADM_BACK);
      return;
    }
    case "adm_prod_block": {
      const field = String(state.adm_block ?? "description");
      const productId = String(state.adm_product ?? "");
      const spec = PROD_FIELDS[field] ?? { label: field, icon: "✏️", kind: "text" as const };
      if (!(await isAdmin(chatId))) return;
      const raw = text.trim();
      let value: any = raw === "-" ? null : text;
      if (spec.kind === "image") {
        const fileId =
          Array.isArray(msg.photo) && msg.photo.length
            ? msg.photo[msg.photo.length - 1]?.file_id
            : msg.document?.mime_type?.startsWith("image/")
              ? msg.document.file_id
              : null;
        if (fileId) value = fileId;
        else if (raw === "-") value = null;
        else if (/^https?:\/\//i.test(raw)) value = raw;
        else {
          await say(chatId, "❌ Send a photo, a valid https image URL, or <code>-</code> to clear.");
          return;
        }
      } else if (spec.kind === "number") {
        if (raw !== "-") {
          const n = Number(raw.replace(/[^0-9.]/g, ""));
          if (!Number.isFinite(n) || (!n && field === "price")) {
            await say(chatId, "❌ Send a valid number, e.g. <code>4.5</code>.");
            return;
          }
          value = n;
        }
      } else if (field === "name" && !raw) {
        await say(chatId, "❌ Name cannot be empty.");
        return;
      }
      state.awaiting = null;
      await setState(chatId, state);
      if (field === "sort_order") {
        if (raw === "-") {
          await normalizeSortOrder();
        } else {
          await setProductPosition(productId, Number(value));
        }
        const v = await admDetailView(productId);
        await say(chatId, `✅ ${spec.icon} ${spec.label} saved.\n\n${v.text}`, v.kb);
        return;
      }
      const { error } = await db.from("products").update({ [field]: value }).eq("id", productId);
      if (error) {
        await say(chatId, `❌ Could not save: ${escapeHtml(error.message)}`, ADM_BACK);
        return;
      }
      const v = await admDetailView(productId);
      await say(chatId, `✅ ${spec.icon} ${spec.label} saved.\n\n${v.text}`, v.kb);
      return;
    }

    case "adm_stock": {
      state.awaiting = null;
      const productId = String(state.adm_product ?? "");
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      let lines: string[] = [];
      try {
        lines = parseStock(text, "auto");
      } catch (e) {
        await say(chatId, `❌ ${e instanceof Error ? e.message : "Could not read that format."}`, ADM_BACK);
        return;
      }
      if (!lines.length) {
        await say(chatId, "❌ No stock lines received.", ADM_BACK);
        return;
      }
      await db.from("stock_items").insert(lines.map((content) => ({ product_id: productId, content })));
      defer(() => notifyRestock(productId, lines.length));
      await say(
        chatId,
        `✅ Added <b>${lines.length}</b> stock item(s).\n\n<b>Preview 1 of ${lines.length}</b>\n<pre>${escapeHtml(lines[0]!)}</pre>`,
        ADM_BACK,
      );
      return;
    }
    case "adm_ui_icon":
    case "adm_ui_text": {
      const mode = state.awaiting;
      state.awaiting = null;
      const uiKey = String(state.adm_ui_key ?? "") as UiKey;
      await setState(chatId, state);
      if (!(await isAdmin(chatId)) || !(uiKey in UI_ELEMENTS)) return;
      const raw = text.trim();
      try {
        if (mode === "adm_ui_icon") {
          const input = readIconInput(msg, text, UI_ELEMENTS[uiKey as keyof typeof UI_ELEMENTS].icon);
          if (input.empty) {
            await say(chatId, ICON_INPUT_HELP, ADM_BACK);
            return;
          }
          const value = input.value;

          await saveIconSetting(`ui_icon_${uiKey}`, value);
          const preview = iconPreviewHtml(value, UI_ELEMENTS[uiKey as keyof typeof UI_ELEMENTS].icon);
          const v = await admUiItemView(uiKey);
          await say(
            chatId,
            `✅ ${UI_ELEMENTS[uiKey as keyof typeof UI_ELEMENTS].label} icon updated → ${preview}\n\nSaved value: <code>${escapeHtml(value || "(empty)")}</code>\n\n${v.text}`,
            v.kb,
          );
          await premiumEmojiNote(chatId, value);
          return;
        } else {


          const value = raw === "-" ? "" : raw.slice(0, 40);
          await saveIconSetting(`ui_text_${uiKey}`, value);
          const v = await admUiItemView(uiKey);
          await say(chatId, `✅ Text updated.\n\n${v.text}`, v.kb);
          return;
        }
      } catch (e) {
        await say(chatId, saveFailText(e), ADM_BACK);
        return;
      }

    }
    case "adm_icon": {
      state.awaiting = null;
      const productId = String(state.adm_product ?? "");
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const input = readIconInput(msg, text, "📦");
      if (input.empty) {
        await say(chatId, ICON_INPUT_HELP, ADM_BACK);
        return;
      }
      const parsedIcon = parseIconValue(input.value, "📦");
      const customEmojiId = parsedIcon.customId;
      const icon = parsedIcon.glyph || "📦";

      const { data: p, error: pErr } = await db
        .from("products")
        .update({ emoji: icon, telegram_custom_emoji_id: customEmojiId || null })
        .eq("id", productId)
        .select("name")
        .maybeSingle();
      if (pErr) {
        await say(chatId, saveFailText(pErr), ADM_BACK);
        return;
      }
      await say(
        chatId,
        p ? `✅ Icon updated: ${customEmojiId ? `<tg-emoji emoji-id="${customEmojiId}">${escapeHtml(icon)}</tg-emoji>` : escapeHtml(icon)} <b>${escapeHtml(p.name)}</b>` : "❌ Product not found.",
        [[{ text: "🎨 More icons", callback_data: "adm:icons" }], ADM_BACK[0]!],
      );
      await premiumEmojiNote(chatId, input.value);
      return;
    }
    case "adm_menu_icon": {
      state.awaiting = null;
      const menuKey = String(state.adm_menu_icon ?? "") as MenuIconKey;
      await setState(chatId, state);
      if (!(await isAdmin(chatId)) || !(menuKey in MENU_ICONS)) return;
      const menuInput = readIconInput(msg, text, MENU_ICONS[menuKey][0]);
      if (menuInput.empty) {
        await say(chatId, ICON_INPUT_HELP, ADM_BACK);
        return;
      }
      const value = menuInput.value;

      try {
        await saveIconSetting(`menu_icon_${menuKey}`, value);
      } catch (e) {
        await say(chatId, saveFailText(e), ADM_BACK);
        return;
      }
      const mv = await admMenuIconView();
      await say(
        chatId,
        `✅ ${MENU_ICONS[menuKey][1]} icon updated → ${iconPreviewHtml(value, MENU_ICONS[menuKey][0])}\n\n${mv.text}`,
        mv.kb,
      );

      await premiumEmojiNote(chatId, value);
      return;
    }
    case "adm_cat_icon": {
      state.awaiting = null;
      const catId = String(state.adm_cat_icon ?? "");
      await setState(chatId, state);
      if (!(await isAdmin(chatId)) || !catId) return;
      const isAllBtn = catId === "all";
      const catInput = readIconInput(msg, text, isAllBtn ? "🗂" : "📁");
      if (catInput.empty) {
        await say(chatId, ICON_INPUT_HELP, ADM_BACK);
        return;
      }
      const value = catInput.value;
      const parsedCat = parseIconValue(value, isAllBtn ? "🗂" : "📁");
      if (isAllBtn) {
        try {
          await saveIconSetting("cat_icon_all", value);
        } catch (e) {
          await say(chatId, saveFailText(e), ADM_BACK);
          return;
        }
        const av = await admCategoryIconView();
        await say(chatId, `✅ All products icon updated → ${iconPreviewHtml(value, "🗂")}\n\n${av.text}`, av.kb);
        await premiumEmojiNote(chatId, value);
        return;
      }
      try {
        const upd = await db
          .from("categories")
          .update({ emoji: parsedCat.glyph || "📁" })
          .eq("id", catId)
          .select("name")
          .maybeSingle();
        if (upd.error) throw upd.error;
        await saveIconSetting(`cat_icon_${catId}`, parsedCat.customId ? value : "");
      } catch (e) {
        await say(chatId, saveFailText(e), ADM_BACK);
        return;
      }
      const cv = await admCategoryIconView();
      await say(chatId, `✅ Category icon updated → ${iconPreviewHtml(value, "📁")}\n\n${cv.text}`, cv.kb);
      await premiumEmojiNote(chatId, value);
      return;
    }
    case "adm_page_icon": {

      state.awaiting = null;
      const pageKey = String(state.adm_page_icon ?? "") as PageIconKey;
      await setState(chatId, state);
      if (!(await isAdmin(chatId)) || !(pageKey in PAGE_ICONS)) return;
      const pageInput = readIconInput(msg, text, PAGE_ICONS[pageKey][0]);
      if (pageInput.empty) {
        await say(chatId, ICON_INPUT_HELP, ADM_BACK);
        return;
      }
      const value = pageInput.value;

      try {
        await saveIconSetting(`page_icon_${pageKey}`, value);
      } catch (e) {
        await say(chatId, saveFailText(e), ADM_BACK);
        return;
      }
      const pv = await admPageIconView();
      await say(
        chatId,
        `✅ ${PAGE_ICONS[pageKey][1]} icon updated → ${iconPreviewHtml(value, PAGE_ICONS[pageKey][0])}\n\n${pv.text}`,
        pv.kb,
      );

      await premiumEmojiNote(chatId, value);
      return;
    }
    case "adm_page_head": {
      state.awaiting = null;
      const headKey = String(state.adm_page_head ?? "") as SectionHeadKey;
      await setState(chatId, state);
      if (!(await isAdmin(chatId)) || !(headKey in SECTION_HEADS)) return;
      const rawHead = (text ?? "").trim();
      const value = rawHead === "-" ? "" : headerHtmlFromMessage(msg, text);
      if (rawHead !== "-" && !value) {
        await say(
          chatId,
          "❌ I could not read a header there.\n\nSend the title as one message (Premium emoji letters, normal emoji or text). Send <code>-</code> to reset.",
          ADM_BACK,
        );
        return;
      }
      try {
        await saveIconSetting(`page_head_${headKey}`, value);
      } catch (e) {
        await say(chatId, saveFailText(e), ADM_BACK);
        return;
      }
      const hv = await admSectionHeadView();
      await say(
        chatId,
        `✅ ${escapeHtml(SECTION_HEADS[headKey])} header ${value ? `updated →\n${value}` : "reset to default"}\n\n${hv.text}`,
        hv.kb,
      );
      await premiumEmojiNote(chatId, value ? "1|x" : "");
      return;
    }
    case "adm_alert_icon": {
      state.awaiting = null;
      const alertKey = String(state.adm_alert_icon ?? "") as AlertIconKey;
      await setState(chatId, state);
      if (!(await isAdmin(chatId)) || !(alertKey in ALERT_ICONS)) return;
      const alertInput = readIconInput(msg, text, ALERT_ICONS[alertKey][0]);
      if (alertInput.empty) {
        await say(chatId, ICON_INPUT_HELP, ADM_BACK);
        return;
      }
      const value = alertInput.value;

      try {
        await saveIconSetting(`alert_icon_${alertKey}`, value);
      } catch (e) {
        await say(chatId, saveFailText(e), ADM_BACK);
        return;
      }
      const av = await admAlertIconView();
      await say(
        chatId,
        `✅ ${ALERT_ICONS[alertKey][1]} updated → ${iconPreviewHtml(value, ALERT_ICONS[alertKey][0])}\n\n${av.text}`,
        av.kb,
      );

      await premiumEmojiNote(chatId, value);
      return;
    }



    case "np_name": {
      if (!(await isAdmin(chatId))) return;
      const name = text.trim();
      if (!name) {
        await say(chatId, "❌ Send a valid product name.");
        return;
      }
      state.np = { ...(state.np ?? {}), name };
      state.awaiting = "np_price";
      await setState(chatId, state);
      await say(chatId, `🆕 <b>Step 2/6</b>\n\nSend the <b>price</b> in USD, e.g. <code>4.5</code>`, [
        [{ text: "✖️ Cancel", callback_data: "adm:stats" }],
      ]);
      return;
    }
    case "np_price": {
      if (!(await isAdmin(chatId))) return;
      const price = Number(text.replace(/[^0-9.]/g, ""));
      if (!price) {
        await say(chatId, "❌ Send a valid price, e.g. <code>4.5</code>");
        return;
      }
      state.np = { ...(state.np ?? {}), price };
      state.awaiting = "np_icon";
      await setState(chatId, state);
      await say(
        chatId,
        "🆕 <b>Step 3/6</b>\n\nSend the product <b>icon</b> — a normal emoji or a Telegram <b>Premium custom emoji</b>. Send <code>-</code> to use 📦.",
        [[{ text: "✖️ Cancel", callback_data: "adm:stats" }]],
      );
      return;
    }
    case "np_icon": {
      if (!(await isAdmin(chatId))) return;
      const npInput = readIconInput(msg, text, "📦");
      const npIcon = parseIconValue(npInput.value, "📦");
      state.np = {
        ...(state.np ?? {}),
        icon: npIcon.glyph || "📦",
        custom_emoji_id: npIcon.customId || "",
      };

      state.awaiting = "np_desc";
      await setState(chatId, state);
      await say(chatId, "🆕 <b>Step 4/6</b>\n\nSend a short <b>description</b>, or <code>-</code> to skip.", [
        [{ text: "✖️ Cancel", callback_data: "adm:stats" }],
      ]);
      return;
    }
    case "np_desc": {
      if (!(await isAdmin(chatId))) return;
      const raw = text.trim();
      const d = { ...(state.np ?? {}), description: raw === "-" ? "" : raw } as ProdDraft;
      state.np = d;
      state.awaiting = "np_banner";
      await setState(chatId, state);
      await say(
        chatId,
        "🆕 <b>Step 5/7</b>\n\nSend the <b>banner image</b> for this product — upload a photo or paste an image URL. Send <code>-</code> to skip.",
        [[{ text: "✖️ Cancel", callback_data: "adm:stats" }]],
      );
      return;
    }
    case "np_banner": {
      if (!(await isAdmin(chatId))) return;
      const raw = text.trim();
      const fileId =
        Array.isArray(msg.photo) && msg.photo.length
          ? msg.photo[msg.photo.length - 1]?.file_id
          : msg.document?.mime_type?.startsWith("image/")
            ? msg.document.file_id
            : null;
      const banner = fileId ?? (raw && raw !== "-" && /^https?:\/\//i.test(raw) ? raw : "");
      if (!fileId && raw && raw !== "-" && !banner) {
        await say(chatId, "❌ Send a photo, a valid https image URL, or <code>-</code> to skip.");
        return;
      }
      const d = { ...(state.np ?? {}), image_url: banner } as ProdDraft;
      state.np = d;
      state.awaiting = null;
      await setState(chatId, state);
      const v = await admWizardDeliveryView(d);
      await say(chatId, v.text, v.kb);
      return;
    }
    case "adm_newprod": {
      state.awaiting = null;
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const parts = text.split("|").map((s) => s.trim());
      const [icon, name, priceRaw, kind] = [parts[0] ?? "", parts[1] ?? "", parts[2] ?? "", parts[3] ?? "auto"];
      const customEmojiId = customEmojiIdFromMessage(msg);
      const price = Number(String(priceRaw).replace(/[^0-9.]/g, ""));
      if (!name || !price) {
        await say(chatId, "❌ Format: <code>icon | name | price | auto/manual</code>", ADM_BACK);
        return;
      }
      const { error } = await db.from("products").insert({
        name,
        emoji: icon || "📦",
        telegram_custom_emoji_id: customEmojiId || null,
        price,
        delivery_type: kind === "manual" ? "manual" : "auto",
        is_active: true,
      });
      await say(
        chatId,
        error ? `❌ ${escapeHtml(error.message)}` : `✅ Product created: ${icon || "📦"} <b>${escapeHtml(name)}</b> — ${money(price)}`,
        [[{ text: "📦 Add stock", callback_data: "adm:stock" }], ADM_BACK[0]!],
      );
      return;
    }
    case "adm_code": {

      state.awaiting = null;
      await setState(chatId, state);
      if (!(await isAdmin(chatId))) return;
      const amount = Number(text.replace(/[^0-9.]/g, ""));
      if (!amount) {
        await say(chatId, "❌ Send a valid amount, e.g. <code>10</code>", ADM_BACK);
        return;
      }
      const code = "GC" + Math.random().toString(36).slice(2, 10).toUpperCase();
      await db.from("redeem_codes").insert({ code, amount });
      await say(chatId, `🎁 New code created:\n\n<code>${code}</code>\nValue: ${money(amount)}`, ADM_BACK);
      return;
    }
    default:
      await say(chatId, "Use /start to open the menu.", [[uiBtn(await getSettings(), "com_home", "home")]]);
  }
}

async function adminStatsText() {
  const [users, orders, pay] = await Promise.all([
    db.from("bot_users").select("telegram_id", { count: "exact", head: true }),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const { data: totals } = await db.from("orders").select("total").eq("status", "completed");
  const revenue = (totals ?? []).reduce((a: number, r: any) => a + Number(r.total), 0);
  return (
    `<b>A D M I N</b>\n\n` +
    `👥 Users: ${users.count ?? 0}\n` +
    `💵 Revenue: ${money(revenue)}\n` +
    `⏳ Pending orders: ${orders.count ?? 0}\n` +
    `💳 Pending payments: ${pay.count ?? 0}`
  );
}

export function adminKeyboard(): Button[][] {
  return [
    [
      { text: "🔄 Refresh", callback_data: "adm:stats" },
      { text: "⏳ Pending orders", callback_data: "adm:orders" },
    ],
    [
      { text: "💳 Payments", callback_data: "adm:pays" },
      { text: "👤 Find user", callback_data: "adm:user" },
    ],
    [
      { text: "📦 Add stock", callback_data: "adm:stock" },
      { text: "🎁 New code", callback_data: "adm:code" },
    ],
    [
      { text: "📢 Broadcast", callback_data: "adm:broadcast" },
      { text: "📣 Announcements", callback_data: "adm:ann" },
      { text: "➕ Add balance", callback_data: "adm:addbal" },
    ],
    [
      { text: "🎨 Active product icons", callback_data: "adm:icons" },
      { text: "🗂 Inactive product icons", callback_data: "adm:iconsoff" },
    ],
    [
      { text: "🚨 Alert icons", callback_data: "adm:alerticons" },
      { text: "🧩 Menu icons", callback_data: "adm:menuicons" },

    ],
    [
      { text: "💳 Payment icons", callback_data: "adm:paymenticons" },
      { text: "🖼 Page icons", callback_data: "adm:pageicons" },
    ],
    [{ text: "🔠 Section headers", callback_data: "adm:heads" }],
    [
      { text: "🔌 API icons", callback_data: "adm:apiicons" },
      { text: "🗂 Category icons", callback_data: "adm:caticons" },
    ],
    [{ text: "🎨 Button colors", callback_data: "adm:bcolors" }],


    [{ text: "🎫 Support tickets", callback_data: "adm:tk" }],
    [{ text: "🔐 Force join gate", callback_data: "adm:jg" }],

    [{ text: "🆕 Add product", callback_data: "adm:npw" }],
    [{ text: "📝 Product details", callback_data: "adm:pdetails" }],
    [{ text: "🔢 Product order / serial", callback_data: "adm:porder" }],
    [{ text: "🎛 UI icons & tags", callback_data: "adm:ui" }],
    [{ text: "⚡ Quick add (one line)", callback_data: "adm:newprod" }],
    [{ text: "🏠 Home", callback_data: "home" }],


  ];
}

const ADM_BACK: Button[][] = [[{ text: "⬅️ Admin panel", callback_data: "adm:stats" }]];

/* --------------------------------------------------- forced join gate ---- */

export type JoinChannel = { chat: string; label: string; url: string };

/** Stored as one channel per line: `chat|label|invite url` (label/url optional). */
function joinChannels(s: Record<string, string>): JoinChannel[] {
  return (s["join_channels"] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [chatRaw = "", labelRaw = "", urlRaw = ""] = line.split("|").map((p) => p.trim());
      const chat = chatRaw;
      const url =
        urlRaw || (chat.startsWith("@") ? `https://t.me/${chat.slice(1)}` : "");
      return { chat, label: labelRaw || chat, url };
    })
    .filter((c) => c.chat);
}

function joinGateOn(s: Record<string, string>) {
  return (s["join_gate"] ?? "off").toLowerCase() === "on" && joinChannels(s).length > 0;
}

const JOINED_STATUSES = new Set(["member", "administrator", "creator", "restricted"]);

/** Channels the user still has to join. Unverifiable chats never block anyone. */
async function missingJoins(chatId: number, s: Record<string, string>): Promise<JoinChannel[]> {
  const list = joinChannels(s);
  const results = await Promise.all(
    list.map(async (c) => {
      try {
        const r = await tg("getChatMember", { chat_id: c.chat, user_id: chatId });
        if (!r?.ok) return null; // bot not admin / bad id → don't lock the user out
        return JOINED_STATUSES.has(String(r.result?.status ?? "")) ? null : c;
      } catch {
        return null;
      }
    }),
  );
  return results.filter(Boolean) as JoinChannel[];
}

function joinGateView(s: Record<string, string>, missing: JoinChannel[]) {
  const kb: Button[][] = missing.map((c) => [
    c.url
      ? { text: `📢 Join ${c.label}`, url: c.url }
      : { text: `📢 ${c.label}`, callback_data: "jg:v" },
  ]);
  kb.push([{ text: "✅ Verify & continue", callback_data: "jg:v" }]);
  const title = (s["join_gate_title"] || "🔒 <b>Membership required</b>").trim();
  const body =
    (s["join_gate_text"] || "").trim() ||
    "Please join our official channel(s) below, then tap <b>Verify &amp; continue</b> to unlock the bot.";
  return { text: `${title}\n──────────────\n${body}`, kb };
}

async function admJoinGateView() {
  const s = await getSettings();
  const list = joinChannels(s);
  const on = (s["join_gate"] ?? "off").toLowerCase() === "on";
  const kb: Button[][] = [
    [{ text: `${on ? "✅ Join gate ON" : "🚫 Join gate OFF"}`, callback_data: "adm:jgt" }],
    [{ text: "➕ Add channel", callback_data: "adm:jgadd" }],
  ];
  list.forEach((c, i) => {
    kb.push([{ text: `🗑 Remove ${c.label}`, callback_data: `adm:jgdel:${i}` }]);
  });
  kb.push([{ text: "🧪 Test my membership", callback_data: "adm:jgtest" }]);
  kb.push(ADM_BACK[0]!);
  return {
    text:
      "🔐 <b>Force join gate</b>\n──────────────\n" +
      `Status: <b>${on ? "ON" : "OFF"}</b>\n` +
      (list.length
        ? list.map((c) => `• <code>${escapeHtml(c.chat)}</code> — ${escapeHtml(c.label)}`).join("\n")
        : "⚠️ No channel added yet.") +
      "\n\nNew users must join these chats on <code>/start</code>, then tap Verify. " +
      "The bot must be an <b>admin</b> in every chat, otherwise membership cannot be checked.",
    kb,
  };
}

async function admOrdersView() {
  const { data } = await db
    .from("orders")
    .select("id,order_no,telegram_id,product_name,quantity,total,delivery_type")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);
  if (!data?.length) return { text: "✅ No pending orders.", kb: ADM_BACK };
  const kb: Button[][] = data.map((o: any) => [
    { text: `#${o.order_no} · ${o.product_name} x${o.quantity}`, callback_data: `adm:o:${o.id}` },
  ]);
  kb.push(ADM_BACK[0]!);
  return { text: `⏳ <b>Pending orders</b> (${data.length})\nTap one to deliver or cancel.`, kb };
}

async function admOrderView(id: string) {
  const { data: o } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (!o) return { text: "Order not found.", kb: ADM_BACK };
  const text =
    `🧾 <b>Order #${o.order_no}</b>\n\n` +
    `Product: ${escapeHtml(o.product_name)} x${o.quantity}\n` +
    `Total: ${money(o.total)}\n` +
    `Buyer: <code>${o.telegram_id}</code>\n` +
    `Status: ${o.status} · ${o.delivery_type}`;
  return {
    text,
    kb: [
      [{ text: "🔁 Retry API delivery", callback_data: `adm:ar:${o.id}` }],
      [{ text: "🚚 Deliver now", callback_data: `adm:od:${o.id}` }],
      [{ text: "❌ Cancel & refund", callback_data: `adm:oc:${o.id}` }],
      [{ text: "⬅️ Back", callback_data: "adm:orders" }],
    ] as Button[][],
  };
}

async function admPaymentsView() {
  const { data } = await db
    .from("payment_requests")
    .select("id,telegram_id,method,amount")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);
  if (!data?.length) return { text: "✅ No pending payment requests.", kb: ADM_BACK };
  const kb: Button[][] = data.map((p: any) => [
    { text: `${money(p.amount)} · ${p.method} · ${p.telegram_id}`, callback_data: `adm:pay:${p.id}` },
  ]);
  kb.push(ADM_BACK[0]!);
  return { text: `💳 <b>Pending payments</b> (${data.length})`, kb };
}

async function admPaymentView(id: string) {
  const { data: p } = await db.from("payment_requests").select("*").eq("id", id).maybeSingle();
  if (!p) return { text: "Payment not found.", kb: ADM_BACK };
  return {
    text:
      `💳 <b>Deposit request</b>\n\n` +
      `User: <code>${p.telegram_id}</code>\n` +
      `Method: ${escapeHtml(p.method)}\n` +
      `Amount: ${money(p.amount)}\n` +
      `TXID: <code>${escapeHtml(p.txid ?? "-")}</code>\n` +
      `Status: ${p.status}`,
    kb: [
      [
        { text: "✅ Approve", callback_data: `adm:pa:${p.id}` },
        { text: "❌ Reject", callback_data: `adm:pr:${p.id}` },
      ],
      [{ text: "⬅️ Back", callback_data: "adm:pays" }],
    ] as Button[][],
  };
}

async function admDecidePayment(id: string, approve: boolean) {
  const { data: p } = await db.from("payment_requests").select("*").eq("id", id).maybeSingle();
  if (!p || p.status !== "pending") return "Already handled.";
  await db
    .from("payment_requests")
    .update({ status: approve ? "approved" : "rejected" })
    .eq("id", id);
  if (!approve) {
    await sendMessage(p.telegram_id, "❌ Your deposit request was rejected. Contact support if this is wrong.");
    return "Rejected.";
  }
  const u = await getUser(p.telegram_id);
  await db
    .from("bot_users")
    .update({ balance: Number(u?.balance ?? 0) + Number(p.amount) })
    .eq("telegram_id", p.telegram_id);
  await db.from("transactions").insert({
    telegram_id: p.telegram_id,
    type: "deposit",
    amount: p.amount,
    method: p.method,
    reference: p.txid,
  });
  await sendMessage(p.telegram_id, `✅ Deposit approved! ${money(p.amount)} added to your balance.`);
  return "Approved and balance credited.";
}

async function admUserView(targetId: number) {
  const u = await getUser(targetId);
  if (!u) return { text: "❌ User not found.", kb: ADM_BACK };
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("telegram_id", targetId);
  return {
    text:
      `👤 <b>${escapeHtml(u.username ? "@" + u.username : (u.first_name ?? "User"))}</b>\n\n` +
      `ID: <code>${u.telegram_id}</code>\n` +
      `Balance: ${money(u.balance)}\n` +
      `Spent: ${money(u.total_spent)}\n` +
      `Orders: ${count ?? 0}\n` +
      `Membership: ${u.membership}\n` +
      `Banned: ${u.is_banned ? "yes 🚫" : "no"}`,
    kb: [
      [{ text: "➕ Add balance", callback_data: `adm:ub:${targetId}` }],
      [{ text: "✉️ Message user", callback_data: `adm:um:${targetId}` }],
      [{ text: u.is_banned ? "✅ Unban" : "🚫 Ban", callback_data: `adm:ux:${targetId}` }],
      [{ text: "⬅️ Admin panel", callback_data: "adm:stats" }],
    ] as Button[][],
  };
}

/* ---------------------------------------------------------------------
 * Product pickers (icon / details / stock)
 * Supplier-imported catalogues can be hundreds of rows, so every picker is
 * paginated and searchable instead of showing only the first 20-30 rows.
 * ------------------------------------------------------------------- */
type PickKind = "icon" | "iconoff" | "detail" | "stock";
const PICK_PAGE_SIZE = 30;
function pickQuery(state: any, kind: PickKind): string {
  return String(state?.adm_pick_q?.[kind] ?? "");
}

const PICK_CFG: Record<
  PickKind,
  { pick: string; page: string; title: string; hint: string; activeOnly?: boolean; inactiveOnly?: boolean }
> = {
  icon: {
    pick: "adm:ip:",
    page: "adm:pgi:",
    title: "🎨 <b>Active product icons</b>",
    hint:
      "Only products that are <b>ON</b> (live on the site &amp; bot).\n" +
      "Pick a product, then send the icon — normal emoji or <b>Telegram Premium custom emoji</b>.",
    activeOnly: true,
  },
  iconoff: {
    pick: "adm:ip:",
    page: "adm:pgio:",
    title: "🗂 <b>Inactive product icons</b>",
    hint:
      "Only products that are <b>OFF</b> (hidden from the site &amp; bot).\n" +
      "Change these whenever you have time — normal emoji or <b>Premium custom emoji</b> both work.",
    inactiveOnly: true,
  },
  detail: {
    pick: "adm:pd:",
    page: "adm:pgd:",
    title: "📝 <b>Product details</b>",
    hint: "Showing 30 products per page. Pick a product to edit its price, description, note, guide, icon or serial.",
  },
  stock: {
    pick: "adm:sp:",
    page: "adm:pgs:",
    title: "📦 <b>Add stock</b>",
    hint: "Showing 30 products per page. Pick the product to add stock to.",
    activeOnly: true,
  },
};

async function admPickView(kind: PickKind, page = 0, q = "") {
  const cfg = PICK_CFG[kind];
  const from = Math.max(0, page) * PICK_PAGE_SIZE;
  let query = db
    .from("products")
    .select("id,name,emoji,telegram_custom_emoji_id,supplier_id", { count: "exact" })
    .is("owner_reseller_id", null);
  if (cfg.activeOnly) query = query.eq("is_active", true);
  if (cfg.inactiveOnly) query = query.eq("is_active", false);

  if (q) query = query.ilike("name", `%${q}%`);
  const { data, count } = await query.order("sort_order").order("name").range(from, from + PICK_PAGE_SIZE - 1);
  const total = Number(count ?? 0);
  const rows = data ?? [];
  const kb: Button[][] = rows.map((p: any) => [productIconButton(p, p.name, `${cfg.pick}${p.id}`)]);

  const nav: Button[] = [];
  if (page > 0) nav.push({ text: "« Prev", callback_data: `${cfg.page}${page - 1}` });
  if (from + PICK_PAGE_SIZE < total) nav.push({ text: "Next »", callback_data: `${cfg.page}${page + 1}` });
  if (nav.length) kb.push(nav);
  kb.push(
    q
      ? [
          { text: "🔎 Search again", callback_data: `adm:fnd:${kind}` },
          { text: "✖️ Clear search", callback_data: `adm:clr:${kind}` },
        ]
      : [{ text: "🔎 Search product", callback_data: `adm:fnd:${kind}` }],
  );
  kb.push(ADM_BACK[0]!);

  const shown = rows.length ? `${from + 1}–${from + rows.length}` : "0";
  return {
    text:
      `${cfg.title}\n\n${cfg.hint}\n\n` +
      (q ? `🔎 Search: <code>${escapeHtml(q)}</code>\n` : "") +
      (total ? `Showing <b>${shown}</b> of <b>${total}</b> products.` : "No products found."),
    kb,
  };
}


/** Every product field an admin can edit from Telegram. */
const PROD_FIELDS: Record<string, { label: string; icon: string; kind: "text" | "number" | "image" }> = {
  name: { label: "Name", icon: "🏷", kind: "text" },
  price: { label: "Price (USD)", icon: "💵", kind: "number" },
  old_price: { label: "Old price", icon: "🏷", kind: "number" },
  badge: { label: "Badge", icon: "🔖", kind: "text" },
  delivery_time: { label: "Delivery time", icon: "⏱", kind: "text" },
  image_url: { label: "Banner image", icon: "🖼", kind: "image" },
  description: { label: "Description", icon: "📖", kind: "text" },
  important_note: { label: "Important note", icon: "❗️", kind: "text" },
  quick_guide: { label: "Quick guide", icon: "💡", kind: "text" },
  sort_order: { label: "Serial / position", icon: "🔢", kind: "number" },
};

/* --------------------------------------------- product serial (sort order) */

const ORDER_PAGE_SIZE = 30;

/** Make sort_order a clean 1..N sequence so up/down/top always behave. */
async function normalizeSortOrder(): Promise<Array<{ id: string; name: string; sort_order: number }>> {
  const { data } = await db.from("products").select("id,name,sort_order").order("sort_order").order("name");
  const rows = (data ?? []) as any[];
  for (let i = 0; i < rows.length; i++) {
    if (Number(rows[i].sort_order ?? 0) !== i + 1) {
      await db.from("products").update({ sort_order: i + 1 }).eq("id", rows[i].id);
    }
  }
  return rows.map((r, i) => ({ id: String(r.id), name: String(r.name), sort_order: i + 1 }));
}

async function admProductOrderView(page = 0) {
  const rows = await normalizeSortOrder();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const from = current * ORDER_PAGE_SIZE;
  const slice = rows.slice(from, from + ORDER_PAGE_SIZE);

  const kb: Button[][] = [];
  for (const p of slice) {
    kb.push([{ text: `${p.sort_order}. ${p.name}`.slice(0, 58), callback_data: `adm:sopos:${p.id}` }]);
    kb.push([
      { text: "⬆️", callback_data: `adm:soup:${p.id}:${current}` },
      { text: "⬇️", callback_data: `adm:sodn:${p.id}:${current}` },
      { text: "⏫ Top", callback_data: `adm:sotop:${p.id}:${current}` },
    ]);
  }
  const nav: Button[] = [];
  if (current > 0) nav.push({ text: "« Prev", callback_data: `adm:sopg:${current - 1}` });
  nav.push({ text: `${current + 1}/${pages}`, callback_data: `adm:sopg:${current}` });
  if (current < pages - 1) nav.push({ text: "Next »", callback_data: `adm:sopg:${current + 1}` });
  kb.push(nav);
  kb.push(ADM_BACK[0]!);

  return {
    text:
      "🔢 <b>Product order</b>\n\n" +
      "Products appear in the shop in this order (top one first).\n" +
      "Tap a name to set its position number directly, or move it with ⬆️ ⬇️ ⏫.\n\n" +
      (total ? `Total <b>${total}</b> products.` : "No products yet."),
    kb,
  };
}

async function moveProductOrder(productId: string, dir: "up" | "down" | "top") {
  const rows = await normalizeSortOrder();
  const idx = rows.findIndex((r) => r.id === productId);
  if (idx < 0) return;
  if (dir === "top") {
    await db.from("products").update({ sort_order: 0 }).eq("id", productId);
  } else {
    const swapWith = dir === "up" ? rows[idx - 1] : rows[idx + 1];
    const currentProduct = rows[idx];
    if (!swapWith || !currentProduct) return;
    await db.from("products").update({ sort_order: swapWith.sort_order }).eq("id", productId);
    await db.from("products").update({ sort_order: currentProduct.sort_order }).eq("id", swapWith.id);
  }
  await normalizeSortOrder();
}

async function setProductPosition(productId: string, requested: number) {
  const rows = await normalizeSortOrder();
  const current = rows.findIndex((r) => r.id === productId);
  if (current < 0) return;
  const target = Math.min(Math.max(1, Math.trunc(requested)), rows.length);
  if (target === current + 1) return;
  const [item] = rows.splice(current, 1);
  if (!item) return;
  rows.splice(target - 1, 0, item);
  for (const [i, product] of rows.entries()) {
    await db.from("products").update({ sort_order: i + 1 }).eq("id", product.id);
  }
}

async function admDetailView(productId: string) {
  const { data: p } = await db.from("products").select("*").eq("id", productId).maybeSingle();
  if (!p) return { text: "Product not found.", kb: ADM_BACK };
  const val = (v: any) => {
    const s = plainRich(v);
    if (!s) return "— empty";
    return s.length > 40 ? `${escapeHtml(s.slice(0, 40))}…` : escapeHtml(s);
  };

  const kb: Button[][] = Object.entries(PROD_FIELDS).map(([key, f]) => [
    { text: `${f.icon} ${f.label}`, callback_data: `adm:pdf:${key}:${productId}` },
  ]);
  kb.push([{ text: "🎨 Set icon (Premium emoji)", callback_data: `adm:ip:${productId}` }]);
  kb.push([{ text: "📦 Stock manager", callback_data: `adm:pdsc:${productId}` }]);
  kb.push([

    {
      text: p.delivery_type === "manual" ? "🔁 Delivery: manual" : "🔁 Delivery: automatic",
      callback_data: `adm:pdt:${productId}`,
    },
  ]);
  kb.push([
    { text: p.is_active === false ? "🚫 Hidden — tap to show" : "✅ Visible — tap to hide", callback_data: `adm:pda:${productId}` },
  ]);
  kb.push([{ text: "⬅️ Products", callback_data: "adm:pdetails" }]);
  kb.push(ADM_BACK[0]!);
  return {
    text:
      `📝 <b>${escapeHtml(p.name)}</b>\n\n` +
      `💵 Price: <b>${money(p.price)}</b>${p.old_price ? ` (was ${money(p.old_price)})` : ""}\n` +
      `🔖 Badge: ${val(p.badge)}\n` +
      `⏱ Delivery time: ${val(p.delivery_time)}\n` +
      `🖼 Banner: ${String(p.image_url ?? "").trim() ? "✅ set" : "— empty"}\n` +
      `📖 Description: ${val(p.description)}\n` +
      `❗️ Important: ${val(p.important_note)}\n` +
      `💡 Quick guide: ${val(p.quick_guide)}\n` +
      `🔢 Serial: <b>${Number(p.sort_order ?? 0) || "auto"}</b>\n\n` +
      `<i>Tap a field to edit. Send <code>-</code> while editing to clear it.</i>`,
    kb,
  };
}

/* ------------------------------------------------- per-product stock manager */

async function admStockView(productId: string) {
  const { data: p } = await db.from("products").select("*").eq("id", productId).maybeSingle();
  if (!p) return { text: "Product not found.", kb: ADM_BACK };
  const { count: free } = await db
    .from("stock_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("is_sold", false);
  const { count: sold } = await db
    .from("stock_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("is_sold", true);
  const supplier = !!p.supplier_id;
  const available = supplier ? Number(p.supplier_stock ?? 0) : (free ?? 0);
  const kb: Button[][] = [
    [{ text: "➕ Add stock (bulk)", callback_data: `adm:sp:${productId}` }],
    [{ text: "👀 Peek last 5 items", callback_data: `adm:pdsl:${productId}` }],
    [{ text: "🗑 Remove 1 unsold item", callback_data: `adm:pdsm:${productId}` }],
    [{ text: "🧹 Clear all unsold stock", callback_data: `adm:pdsx:${productId}` }],
    [{ text: "📣 Post restock to channel", callback_data: `adm:pdrs:${productId}` }],
    [
      {
        text: p.is_active === false ? "🚫 Hidden — tap to show" : "✅ Visible — tap to hide",
        callback_data: `adm:pda:${productId}`,
      },
    ],
    [{ text: "⬅️ Product details", callback_data: `adm:pd:${productId}` }],
    ADM_BACK[0]!,
  ];
  return {
    text:
      `📦 <b>Stock · ${escapeHtml(p.name)}</b>\n──────────────\n` +
      (supplier ? `🔌 Supplier product — stock comes from the supplier API.\n` : "") +
      `✅ Available: <b>${available}</b>\n` +
      `💤 Sold: <b>${sold ?? 0}</b>\n` +
      `💵 Price: <b>${money(p.price)}</b>\n` +
      `🚚 Delivery: <b>${p.delivery_type === "manual" ? "manual" : "automatic"}</b>\n\n` +
      (available === 0
        ? "⚠️ <b>Out of stock</b> — buyers see the “notify me” button.\n\n"
        : "") +
      "<i>Adding stock automatically alerts waiting users and posts BACK IN STOCK to your channel.</i>",
    kb,
  };
}

/* -------------------------------------------------------- announcement hub */

function annOn(s: Record<string, string>, key: string) {
  return (s[key] ?? "on").toLowerCase() !== "off";
}

async function admAnnounceView() {
  const s = await getSettings();
  const chat = (s["announce_chat_id"] ?? "").trim();
  const sales = annOn(s, "announce_sales");
  const restock = annOn(s, "announce_restock");
  const dm = annOn(s, "announce_dm");
  const kb: Button[][] = [
    [{ text: chat ? `🆔 Channel: ${chat}` : "🆔 Set channel / group ID", callback_data: "adm:anid" }],
    [{ text: `${sales ? "✅" : "🚫"} Live sale posts`, callback_data: "adm:antg:sales" }],
    [{ text: `${restock ? "✅" : "🚫"} Restock posts`, callback_data: "adm:antg:restock" }],
    [{ text: `${dm ? "✅" : "🚫"} Also DM all bot users`, callback_data: "adm:antg:dm" }],
    [{ text: "✍️ Send announcement now", callback_data: "adm:anmsg" }],
    [{ text: "🧪 Send test post", callback_data: "adm:antest" }],
    ADM_BACK[0]!,
  ];
  return {
    text:
      "📣 <b>Announcements</b>\n──────────────\n" +
      (chat ? `Channel: <code>${escapeHtml(chat)}</code>\n` : "⚠️ No channel/group ID set yet.\n") +
      `Live sales: <b>${sales ? "ON" : "OFF"}</b>\n` +
      `Restock alerts: <b>${restock ? "ON" : "OFF"}</b>\n` +
      `Bot DM copies: <b>${dm ? "ON" : "OFF"}</b>\n\n` +
      "How to get the ID: add <code>@userinfobot</code> to your channel/group, copy the ID " +
      "(looks like <code>-1001234567890</code>), then make this bot an <b>admin</b> there.",
    kb,
  };
}







async function admMenuIconView() {
  const settings = await getSettings();
  const kb = (Object.keys(MENU_ICONS) as MenuIconKey[]).map((key) => [
    iconButton(settings, key, `adm:mi:${key}`, MENU_ICONS[key][1]),
  ]);
  kb.push(ADM_BACK[0]!);
  const list = iconPreviewLines(
    settings,
    "menu_icon_",
    (Object.keys(MENU_ICONS) as MenuIconKey[]).map((k) => [k, MENU_ICONS[k][1], MENU_ICONS[k][0]]),
  );
  return {
    text:
      "🧩 <b>Menu icons</b>\n\nPick a button, then send a normal or Telegram Premium custom emoji. Send <code>-</code> to reset.\n\n" +
      `<b>Current icons</b>\n${list}`,
    kb,
  };
}

async function admPageIconView() {
  const settings = await getSettings();
  const kb: Button[][] = (Object.keys(PAGE_ICONS) as PageIconKey[]).map((key) => {
    const parsed = parseIconValue(settings[`page_icon_${key}`] ?? "", PAGE_ICONS[key][0]);
    return [
      {
        text: `${parsed.customId ? "✨" : parsed.glyph} ${PAGE_ICONS[key][1]}`.trim(),
        callback_data: `adm:pi:${key}`,
        ...(parsed.customId ? { icon_custom_emoji_id: parsed.customId } : {}),
      },
    ];
  });
  kb.push(ADM_BACK[0]!);
  const list = iconPreviewLines(
    settings,
    "page_icon_",
    (Object.keys(PAGE_ICONS) as PageIconKey[]).map((k) => [k, PAGE_ICONS[k][1], PAGE_ICONS[k][0]]),
  );
  return {
    text:
      "🖼 <b>Page icons</b>\n\nEvery bot page (shop, product, checkout, payment, wallet, orders…) has a header icon.\n" +
      "Pick a page, then send a normal emoji or a <b>Telegram Premium custom emoji</b>. Send <code>-</code> to reset.\n\n" +
      `<b>Current icons</b>\n${list}`,
    kb,
  };
}


/** Section headers — a full Premium-emoji title line for every bot page. */
async function admSectionHeadView() {
  const settings = await getSettings();
  const keys = Object.keys(SECTION_HEADS) as SectionHeadKey[];
  const kb: Button[][] = keys.map((key) => [
    {
      text: `${String(settings[`page_head_${key}`] ?? "").trim() ? "✨" : "▫️"} ${SECTION_HEADS[key]}`,
      callback_data: `adm:hd:${key}`,
    },
  ]);
  kb.push(ADM_BACK[0]!);
  const list = keys
    .map((key) => {
      const v = String(settings[`page_head_${key}`] ?? "").trim();
      return `<b>${escapeHtml(SECTION_HEADS[key])}</b> — ${v || "<i>default</i>"}`;
    })
    .join("\n");
  return {
    text:
      "🔠 <b>Section headers</b>\n\n" +
      "Pick a page, then send the title exactly as you want it on top of that page — " +
      "a line of <b>Telegram Premium emoji letters</b> (like the P R O D U C T S banner), normal emoji or plain text.\n" +
      "Send <code>-</code> to restore the default header.\n\n" +
      `<b>Current headers</b>\n${list}`,
    kb,
  };
}

/** Button colors — pick the native Telegram colour for each group of buttons. */
async function admButtonColorView() {
  const settings = await getSettings();
  const kb: Button[][] = COLOR_SLOTS.map((s) => [
    styled(
      { text: `${COLOR_LABEL[btnColor(settings, s.key)]} · ${s.label}`, callback_data: `adm:bc:${s.key}` },
      btnColor(settings, s.key),
    ),
  ]);
  kb.push(ADM_BACK[0]!);
  const list = COLOR_SLOTS.map(
    (s) => `${COLOR_LABEL[btnColor(settings, s.key)]} <b>${escapeHtml(s.label)}</b>`,
  ).join("\n");
  return {
    text:
      "🎨 <b>Button colors</b>\n\nTap a group to switch its colour — 🔵 Blue → 🟢 Green → 🔴 Red.\n" +
      "New messages sent by the bot use the colour you pick here.\n\n" +
      `<b>Current colors</b>\n${list}`,
    kb,
  };
}

/** Category icons — Premium custom emoji supported, shared by bot + website glyph. */
async function admCategoryIconView() {
  const settings = await getSettings();
  const { data } = await db.from("categories").select("id,name,emoji,is_active").order("sort_order");
  const cats = (data ?? []) as any[];
  const allIc = allProductsIcon(settings);
  const kb: Button[][] = cats.map((c) => {
    const ic = catIcon(settings, c);
    return [
      {
        text: `${ic.customId ? "✨" : ic.glyph} ${c.name}${c.is_active ? "" : " (off)"}`.trim(),
        callback_data: `adm:ci:${c.id}`,
        ...(ic.customId ? { icon_custom_emoji_id: ic.customId } : {}),
      },
    ];
  });
  kb.unshift([
    {
      text: `${allIc.customId ? "✨" : allIc.glyph} All products`.trim(),
      callback_data: "adm:ci:all",
      ...(allIc.customId ? { icon_custom_emoji_id: allIc.customId } : {}),
    },
  ]);
  kb.push(ADM_BACK[0]!);
  const allPreview = allIc.customId
    ? `<tg-emoji emoji-id="${allIc.customId}">${escapeHtml(allIc.glyph)}</tg-emoji>`
    : escapeHtml(allIc.glyph);
  const list = cats.length
    ? cats
        .map((c) => {
          const ic = catIcon(settings, c);
          const preview = ic.customId
            ? `<tg-emoji emoji-id="${ic.customId}">${escapeHtml(ic.glyph)}</tg-emoji>`
            : escapeHtml(ic.glyph);
          return `${preview} <b>${escapeHtml(c.name)}</b>${ic.customId ? " · ✨ Premium" : ""}`;
        })
        .join("\n")
    : "No categories yet.";
  return {
    text:
      "🗂 <b>Category icons</b>\n\nPick a category, then send a normal emoji or a <b>Telegram Premium custom emoji</b> " +
      "(type it, send it as a sticker, or paste its numeric id). Send <code>-</code> to reset.\n\n" +
      `<b>Current icons</b>\n${allPreview} <b>All products</b>${allIc.customId ? " · ✨ Premium" : ""}\n${list}`,
    kb,
  };
}

/** Icons used inside stock / price alert cards — Premium emoji supported. */

async function admAlertIconView() {
  const settings = await getSettings();
  const kb: Button[][] = (Object.keys(ALERT_ICONS) as AlertIconKey[]).map((key) => {
    const parsed = parseIconValue(settings[`alert_icon_${key}`] ?? "", ALERT_ICONS[key][0]);
    return [
      {
        text: `${parsed.customId ? "✨" : parsed.glyph} ${ALERT_ICONS[key][1]}`.trim(),
        callback_data: `adm:ai:${key}`,
        ...(parsed.customId ? { icon_custom_emoji_id: parsed.customId } : {}),
      },
    ];
  });
  kb.push(ADM_BACK[0]!);
  const list = iconPreviewLines(
    settings,
    "alert_icon_",
    (Object.keys(ALERT_ICONS) as AlertIconKey[]).map((k) => [k, ALERT_ICONS[k][1], ALERT_ICONS[k][0]]),
  );
  return {
    text:
      "🚨 <b>Alert icons</b>\n\nThese icons are used in the stock, restock, sold-out and price alert cards " +
      "sent to the channel and to bot users.\n" +
      "Pick one, then send a normal emoji or a <b>Telegram Premium custom emoji</b>. Send <code>-</code> to reset.\n\n" +
      `<b>Current icons</b>\n${list}`,
    kb,
  };
}



/* ------------------------------- every button + tag of every page (UI kit) */

const UI_GROUP_LABEL: Record<string, string> = {
  shop: "🛍 Shop page",
  product: "📦 Product page",
  cart: "🧺 Cart page",
  checkout: "🧾 Checkout page",
  payment: "💳 Payment page",
  wallet: "💰 Wallet page",
  orders: "📬 Orders page",
  deposit: "🪙 Deposit / Binance Pay",
  quantity: "🔢 Quantity page",
  profile: "👤 Profile & Referral",
  refstore: "🎯 Referral store",
  freebies: "🎁 Freebies page",
  support: "🆘 Support page",
  history: "🧾 Transactions page",
  common: "🧩 Shared buttons",
};



async function admUiGroupView() {
  const kb: Button[][] = UI_GROUPS.map((g) => [
    { text: `${UI_GROUP_LABEL[g] ?? g} (${uiKeysOf(g).length})`, callback_data: `adm:uig:${g}` },
  ]);
  kb.push(ADM_BACK[0]!);
  return {
    text:
      "🎛 <b>UI icons &amp; tags</b>\n\nEvery button and tag of every page can be customized.\n" +
      "Pick a page → pick an element → set a <b>Premium custom emoji</b> / normal emoji, or rename its text.",
    kb,
  };
}

async function admPaymentIconsView() {
  const settings = await getSettings();
  const keys = [
    ["pay_bkash", "wal_bkash"],
    ["pay_nagad", "wal_nagad"],
    ["pay_rocket", "wal_rocket"],
  ] as const;
  const kb: Button[][] = keys.map(([checkoutKey, walletKey]) => [
    uiBtn(settings, checkoutKey, `adm:uie:${checkoutKey}`, "· Checkout"),
    uiBtn(settings, walletKey, `adm:uie:${walletKey}`, "· Wallet"),
  ]);
  kb.push([{ text: "🎛 All UI icons & tags", callback_data: "adm:ui" }]);
  kb.push(...ADM_BACK);
  return {
    text:
      `${uiTag(settings, "pay_title")}

` +
      "Choose bKash, Nagad or Rocket. Then tap Set icon and send a normal emoji " +
      "or a Telegram Premium custom emoji. The Checkout and Wallet icons are saved separately.",
    kb,
  };
}

async function admUiListView(group: string) {
  const settings = await getSettings();
  const keys = uiKeysOf(group);
  if (!keys.length) return await admUiGroupView();
  const kb: Button[][] = keys.map((k) => [uiBtn(settings, k, `adm:uie:${k}`)]);
  kb.push([{ text: "⬅️ Pages", callback_data: "adm:ui" }]);
  kb.push(ADM_BACK[0]!);
  return { text: `${UI_GROUP_LABEL[group] ?? group}\n\nTap the element you want to customize:`, kb };
}

async function admUiItemView(key: UiKey) {
  const settings = await getSettings();
  const entry = UI_ELEMENTS[key];
  const text =
    `🎛 <b>${escapeHtml(entry.label)}</b>\n──────────────\n` +
    `Preview: ${uiTag(settings, key)}\n` +
    `Current text: <b>${escapeHtml(uiText(settings, key))}</b>\n` +
    `Default: ${escapeHtml(entry.icon)} ${escapeHtml(entry.label)}\n\n` +
    `Choose what to change:`;
  return {
    text,
    kb: [
      [{ text: "🎨 Set icon", callback_data: `adm:uii:${key}` }],
      [{ text: "✏️ Set text (tag)", callback_data: `adm:uit:${key}` }],
      [{ text: "♻️ Reset to default", callback_data: `adm:uir:${key}` }],
      [{ text: "⬅️ Back", callback_data: `adm:uig:${entry.group}` }],
    ] as Button[][],
  };
}


/* ------------------------------------------- step-by-step product wizard */

type ProdDraft = {
  name?: string;
  price?: number;
  icon?: string;
  custom_emoji_id?: string;
  description?: string;
  image_url?: string;
  delivery_type?: "auto" | "manual";
  category_id?: string | null;
};

function draftSummary(d: ProdDraft) {
  const icon = d.custom_emoji_id
    ? `<tg-emoji emoji-id="${d.custom_emoji_id}">${escapeHtml(d.icon || "📦")}</tg-emoji>`
    : escapeHtml(d.icon || "📦");
  return (
    `${icon} <b>${escapeHtml(d.name ?? "-")}</b>\n` +
    `💎 Price: ${money(d.price ?? 0)}\n` +
    `📦 Delivery: ${d.delivery_type ?? "—"}\n` +
    (d.description ? `📝 ${escapeHtml(d.description)}\n` : "") +
    (d.image_url ? `🖼 Banner: attached\n` : "")
  );
}

async function admWizardDeliveryView(d: ProdDraft) {
  return {
    text: `🆕 <b>New product · step 6/7</b>\n\n${draftSummary(d)}\nChoose the delivery type:`,
    kb: [
      [{ text: "⚡ Auto (from stock)", callback_data: "adm:npd:auto" }],
      [{ text: "🙋 Manual (admin delivers)", callback_data: "adm:npd:manual" }],
      [{ text: "✖️ Cancel", callback_data: "adm:stats" }],
    ] as Button[][],
  };
}

async function admWizardCategoryView(d: ProdDraft) {
  const { data } = await db
    .from("categories")
    .select("id,name,emoji")
    .order("sort_order")
    .limit(20);
  const kb: Button[][] = (data ?? []).map((c: any) => [
    { text: `${c.emoji ?? "📁"} ${c.name}`, callback_data: `adm:npc:${c.id}` },
  ]);
  kb.push([{ text: "— No category —", callback_data: "adm:npc:none" }]);
  kb.push([{ text: "✖️ Cancel", callback_data: "adm:stats" }]);
  return { text: `🆕 <b>New product · step 7/7</b>\n\n${draftSummary(d)}\nPick a category:`, kb };
}

async function admCreateProduct(chatId: number, d: ProdDraft) {
  const { data: created, error } = await db
    .from("products")
    .insert({
      name: d.name,
      emoji: d.icon || "📦",
      telegram_custom_emoji_id: d.custom_emoji_id || null,
      description: d.description || null,
      image_url: d.image_url || null,
      price: d.price ?? 0,
      delivery_type: d.delivery_type === "manual" ? "manual" : "auto",
      category_id: d.category_id ?? null,
      is_active: true,
    })
    .select("id,name")
    .maybeSingle();

  if (error || !created) {
    await say(chatId, `❌ Could not create the product: ${escapeHtml(error?.message ?? "unknown error")}`, ADM_BACK);
    return;
  }

  const kb: Button[][] = [];
  if (d.delivery_type !== "manual") kb.push([{ text: "📦 Add stock now", callback_data: `adm:sp:${created.id}` }]);
  kb.push([{ text: "🆕 Add another product", callback_data: "adm:npw" }]);
  kb.push([{ text: "🎨 Set product icon", callback_data: `adm:ip:${created.id}` }]);
  kb.push(ADM_BACK[0]!);
  await say(chatId, `✅ <b>Product created!</b>\n\n${draftSummary(d)}`, kb);
}







/* --------------------------------------------- direct checkout (pay per order) */

type Coupon = { code: string; percent: number; amount_off: number };
type CoMeta = { items: CartLine[]; coupon?: Coupon | null; summary?: string; total?: number };

async function coTotals(meta: CoMeta, chatId?: number) {
  const ids = meta.items.map((i) => i.product_id);
  const { data: products } = await db.from("products").select("*").eq("is_active", true).in("id", ids);
  const lines = meta.items
    .map((i) => {
      const p = (products ?? []).find((x: any) => x.id === i.product_id);
      return p ? { product: p, qty: i.qty, subtotal: Number(p.price) * i.qty } : null;
    })
    .filter(Boolean) as any[];
  const subtotal = Math.round(lines.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
  const c = meta.coupon;
  let tierPct = 0;
  if (chatId) {
    const u = await getUser(chatId);
    tierPct = tierInfo(u?.total_spent ?? 0).current.discount;
  }
  const tierOff = Math.round(((subtotal * tierPct) / 100) * 100) / 100;
  let discount = c ? (subtotal * Number(c.percent || 0)) / 100 + Number(c.amount_off || 0) : 0;
  discount = Math.max(0, Math.min(subtotal, Math.round((discount + tierOff) * 100) / 100));
  const total = Math.round((subtotal - discount) * 100) / 100;
  return { lines, subtotal, discount, total, tierPct, tierOff };
}

async function readCo(chatId: number): Promise<CoMeta | null> {
  const u = await getUser(chatId);
  const co = (u?.state ?? {}).co;
  return co && Array.isArray(co.items) && co.items.length ? (co as CoMeta) : null;
}

async function writeCo(chatId: number, meta: CoMeta | null) {
  const { data } = await db.from("bot_users").select("state").eq("telegram_id", chatId).maybeSingle();
  const state = (data?.state ?? {}) as any;
  if (meta) state.co = meta;
  else delete state.co;
  await db.from("bot_users").update({ state }).eq("telegram_id", chatId);
}

async function coView(chatId: number) {
  const meta = await readCo(chatId);
  if (!meta) {
    return {
      text: "🧺 Nothing to check out.",
      kb: [[uiBtn(await getSettings(), "com_shop", "shop:0")], [uiBtn(await getSettings(), "com_home", "home")]] as Button[][],
    };
  }
  const { lines, subtotal, discount, total, tierPct, tierOff } = await coTotals(meta, chatId);
  const settings = await getSettings();
  let text = `${sectionHead(settings, "checkout", `${pageIconHtml(settings, "checkout")} <b>C H E C K O U T</b>`)}\n──────────────\n`;
  for (const l of lines) {
    text += `${productIconHtml(l.product)} <b>${l.product.name}</b>\n   ${l.qty} × ${money(l.product.price)} = <b>${money(l.subtotal)}</b>\n`;
  }
  text += `──────────────\n${uiTag(settings, "co_subtotal")}: ${money(subtotal)}\n`;
  if (tierPct > 0) text += `${uiTag(settings, "co_tier_line")} (${tierPct}%): −${money(tierOff)}\n`;
  if (meta.coupon) text += `🏷 Coupon <code>${escapeHtml(meta.coupon.code)}</code>: −${money(Math.max(0, discount - tierOff))}\n`;
  text += `${uiTag(settings, "co_total")}: <b>${money(total)}</b>\n\n<i>No wallet deposit needed — pay directly and it will be verified automatically.</i>`;

  const kb: Button[][] = [];
  kb.push([
    meta.coupon
      ? uiBtn(settings, "co_coupon_rm", "cocrm")
      : uiBtn(settings, "co_coupon", "cocpn"),
  ]);
  kb.push([uiBtn(settings, "co_pay", "copay", `· ${money(total)}`)]);
  kb.push([iconButton(settings, "shop", "shop:0"), iconButton(settings, "back", "home")]);
  return { text, kb };
}

async function coPayView(chatId: number) {
  const meta = await readCo(chatId);
  if (!meta) return await coView(chatId);
  const { total, lines } = await coTotals(meta, chatId);
  const cfg = await binanceConfig();
  const settings = await getSettings();
  const user = await getUser(chatId);
  const kb: Button[][] = [];
  if (Number(user.balance) >= total && total > 0)
    kb.push([uiBtn(settings, "pay_balance", "copm:balance", `(${money(user.balance)})`)]);
  if (cfg.active && cfg.payid) kb.push([uiBtn(settings, "pay_payid", "copm:payid")]);
  if (cfg.active && cfg.crypto) {
    kb.push([uiBtn(settings, "pay_bep20", "copm:BSC")]);
    kb.push([uiBtn(settings, "pay_trc20", "copm:TRX")]);
  }
  {
    const { paykoriConfig } = await import("@/lib/paykori.server");
    const pk = paykoriConfig(settings);
    if (pk.enabled) {
      for (const m of pk.methods) kb.push([uiBtn(settings, `pay_${m}` as any, `copm:pk_${m}`)]);
    }
  }
  kb.push([uiBtn(settings, "pay_back", "co")]);

  const items = lines
    .map(
      (l: any) =>
        `${productIconHtml(l.product)} <b>${escapeHtml(l.product.name)}</b> x ${l.qty}`,
    )
    .join("\n");
  return {
    text:
      `${uiIconHtml(settings, "pay_title")} <b>${escapeHtml(uiText(settings, "pay_title"))}</b>\n\n` +
      `${items}\n` +
      `${escapeHtml(uiText(settings, "pay_item_total"))}: <b>${money(total)} USDT</b>`,
    kb,
  };
}

/** Create the paid orders, deliver instantly or notify the admin for manual delivery. */
async function fulfillCheckout(chatId: number, meta: CoMeta, methodKey: string, reference: string) {
  const { lines, discount, total } = await coTotals(meta, chatId);
  let user = await getUser(chatId);

  // Charge the order total atomically. The DB refuses the debit when the
  // balance is too low, so double-tapping / racing callbacks can never get
  // two deliveries out of one payment.
  const { data: charged, error: chargeError } = await db.rpc("bot_user_debit", {
    _telegram_id: chatId,
    _amount: Math.round(total * 100) / 100,
    _method: methodKey,
    _reference: reference,
    _note: meta.summary ?? lines.map((l) => `${l.qty}x ${l.product.name}`).join(", "),
  });
  if (chargeError || !charged) {
    return {
      text: `❌ We could not charge this order (${escapeHtml(chargeError?.message ?? "insufficient balance")}). Nothing was delivered — please check your balance and try again.`,
      kb: [[uiBtn(await getSettings(), "com_wallet", "wallet")], [uiBtn(await getSettings(), "com_home", "home")]] as Button[][],
    };
  }
  // Clear the checkout basket immediately so the same cart cannot be paid twice.
  await writeCo(chatId, null);
  await db
    .from("bot_users")
    .update({ membership: membershipFor(Number((charged as any).total_spent ?? 0)) })
    .eq("telegram_id", chatId);


  const share = lines.length ? discount / lines.length : 0;
  let text = `<b>O R D E R   C O N F I R M E D</b>\n──────────────\n💳 Paid: <b>${money(total)}</b>\n`;
  const serialQueue: { name: string; orderNo?: number; items: string[] }[] = [];
  let pending = 0;

  for (const l of lines) {
    const p = l.product;
    let delivered: string | null = null;
    let deliveredItems: string[] = [];
    let status = "pending";
    let autoFailReason = "";
    if (p.supplier_id && p.supplier_external_id) {
      try {
        const { supplierOrder } = await import("@/lib/suppliers/api.server");
        const { supplierPreflight } = await import("@/lib/suppliers/fulfil.server");
        const { data: sup } = await db.from("suppliers").select("*").eq("id", p.supplier_id).maybeSingle();
        if (!sup) autoFailReason = "Supplier record not found";
        else if (!sup.is_enabled) autoFailReason = `Supplier “${sup.name ?? sup.code}” is disabled in admin`;
        else {
          // Advisory only — several supplier balance endpoints report 0/stale
          // values even for funded wallets, so never block delivery on it.
          const pre = await supplierPreflight(sup, Number(p.price) * l.qty);
          try {
            const res = await supplierOrder(
              sup as any,
              String(p.supplier_external_id),
              l.qty,
              `qorix-${chatId}-${p.id}-${Date.now()}`,
            );
            if (res.items.length) {
              deliveredItems = res.items;
              delivered = deliveredItems.join("\n---\n");
              status = "completed";
            } else {
              autoFailReason = `Supplier accepted the order but returned no items${res.code ? ` (ref ${res.code})` : ""}`;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            autoFailReason = pre.ok ? msg : `${msg} — ${pre.reason}`;
          }
        }

      } catch (error) {
        autoFailReason = error instanceof Error ? error.message : String(error);
        console.error("Supplier order failed:", error);
      }
    } else if (p.delivery_type === "auto") {
      // Atomic claim: two concurrent orders can never receive the same item.
      const { data: items } = await db.rpc("claim_stock_items", {
        _product_id: p.id,
        _qty: l.qty,
        _sold_to: chatId,
      });
      const claimed = (items ?? []) as any[];
      if (claimed.length >= l.qty) {
        deliveredItems = claimed.map((i: any) => String(i.content));
        delivered = deliveredItems.join("\n---\n");
        status = "completed";
      } else if (claimed.length) {
        // Not enough stock — release what we claimed so it stays sellable.
        await db
          .from("stock_items")
          .update({ is_sold: false, sold_to: null, sold_at: null })
          .in("id", claimed.map((i: any) => i.id));
      }
    }


    const { data: order } = await db
      .from("orders")
      .insert({
        telegram_id: chatId,
        product_id: p.id,
        product_name: p.name,
        quantity: l.qty,
        unit_price: p.price,
        total: Math.max(0, Math.round((l.subtotal - share) * 100) / 100),
        status,
        delivery_type: p.delivery_type,
        delivered_content: delivered,
        coupon_code: meta.coupon?.code ?? null,
        discount: Math.round(share * 100) / 100,
      })
      .select("*")
      .maybeSingle();

    text += `• #${order?.order_no} — ${l.qty}× ${p.name}${status === "completed" ? " ✅" : " ⏳ manual"}\n`;
    if (deliveredItems.length) {
      serialQueue.push({ name: p.name, orderNo: order?.order_no, items: deliveredItems });
    }
    if (status !== "completed") {
      pending++;
      await notifyAdmins(
        `🕐 <b>Manual delivery needed — order #${order?.order_no}</b>\n` +
          `User: <code>${chatId}</code>${user?.username ? ` (@${user.username})` : ""}\n` +
          `${l.qty}× ${p.name}\nPaid: <b>${money(l.subtotal)}</b> via ${methodKey}\n` +
          `Ref: <code>${escapeHtml(reference)}</code>\n` +
          (autoFailReason ? `⚠️ Auto (API) delivery failed: <code>${escapeHtml(autoFailReason)}</code>\n` : "") +
          `\n` +
          (await manualNoteFor(p.id)) +

          `<i>Tap “Deliver now”, then paste ${l.qty} item(s) — one per line, or blocks separated by ---. ` +
          `Each item is sent to this buyer only, numbered “1 of ${l.qty}”, “2 of ${l.qty}”…</i>`,
        order?.id
          ? [
              [{ text: "🔁 Retry API delivery", callback_data: `adm:ar:${order.id}` }],
              [{ text: "🚚 Deliver now", callback_data: `adm:od:${order.id}` }],
              [{ text: "❌ Cancel & refund", callback_data: `adm:oc:${order.id}` }],
              [{ text: "⏳ All pending orders", callback_data: "adm:orders" }],
            ]
          : undefined,
      );
    }
    await announcePurchase(user, p, l.qty);
  }

  // referral commission on the paid total
  user = await getUser(chatId);
  if (user?.referred_by) {
    const s = await getSettings();
    const pct = Number(s["referral_percent"] || 0);
    const commission = Number(((total * pct) / 100).toFixed(2));
    if (commission > 0) {
      const { data: ref } = await db
        .from("bot_users")
        .select("balance,referral_earnings")
        .eq("telegram_id", user.referred_by)
        .maybeSingle();
      if (ref) {
        await db
          .from("bot_users")
          .update({
            balance: Number(ref.balance) + commission,
            referral_earnings: Number(ref.referral_earnings) + commission,
          })
          .eq("telegram_id", user.referred_by);
        await db.from("transactions").insert({
          telegram_id: user.referred_by,
          type: "referral",
          amount: commission,
          note: `Referral commission from ${maskUsername(user.username, user.first_name)}`,
        });
      }
    }
  }

  if (meta.coupon) {
    const { data: c } = await db.from("coupons").select("id,used_count").eq("code", meta.coupon.code).maybeSingle();
    if (c) await db.from("coupons").update({ used_count: Number(c.used_count) + 1 }).eq("id", c.id);
  }

  await writeCo(chatId, null);
  await writeCart(chatId, []);

  if (serialQueue.length) {
    const totalItems = serialQueue.reduce((a, q) => a + q.items.length, 0);
    text += `\n🎁 <b>${totalItems} item(s) are being sent one by one below.</b>\n`;
    // Register the send as tracked background work: the confirmation is shown
    // first, then flushBackground keeps Cloudflare alive until every credential
    // reaches Telegram. A detached promise was cancelled after the first item.
    defer(async () => {
      for (const q of serialQueue) {
        for (let i = 0; i < q.items.length; i++) {
          const item = q.items[i];
          if (!item) continue;
          const sent = await sendMessage(
            chatId,
            `📦 <b>${escapeHtml(q.name)} — ${i + 1} of ${q.items.length}</b>` +
              (q.orderNo ? `\nOrder #${q.orderNo}` : "") +
              `\n<pre>${escapeHtml(item)}</pre>`,
          );
          if (!sent.ok) {
            console.error(
              `Telegram delivery item ${i + 1}/${q.items.length} failed for order ${q.orderNo ?? "unknown"}:`,
              sent.description ?? "Unknown Telegram error",
            );
          }
        }
      }
    });
  }
  if (pending)
    text +=
      `\n⏳ <b>${pending} item(s) need manual delivery.</b>\n` +
      `Our admin has been notified and will deliver here shortly. Please wait — you can check progress with /orders.\n`;

  const settingsK = await getSettings();
  const kb: Button[][] = [
    [uiBtn(settingsK, "ord_my", "orders")],
    [uiBtn(settingsK, "ord_shop", "shop:0"), uiBtn(settingsK, "ord_home", "home")],
  ];
  return { text, kb };
}

/** Start a checkout for a single product or the whole cart. */
async function startCheckout(chatId: number, items: CartLine[]) {
  if (!items.length) return null;
  const meta: CoMeta = { items, coupon: null };
  const { lines, total } = await coTotals(meta, chatId);
  if (!lines.length) return null;
  meta.summary = lines.map((l) => `${l.qty}x ${l.product.name}`).join(", ");
  meta.total = total;
  await writeCo(chatId, meta);
  return await coView(chatId);
}

const ORDERS_PER_PAGE = 7;
const ORDER_TEXT_LIMIT = 3200;

function orderTimeText(iso: string | null | undefined, settings: Record<string, string>) {
  if (!iso) return "-";
  const tz = (settings["order_timezone"] || "Asia/Karachi").trim();
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    })
      .format(new Date(iso))
      .replace(/,\s(\d)/, " • $1");
  } catch {
    return new Date(iso).toUTCString();
  }
}

/** Every order of this user, newest first (used by the history + detail views). */
async function userOrders(chatId: number) {
  const { data } = await db
    .from("orders")
    .select("*")
    .eq("telegram_id", chatId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as any[];
}

async function findUserOrder(chatId: number, code: string) {
  const wanted = code.toUpperCase();
  const rows = await userOrders(chatId);
  return rows.find((o) => orderCode(o.id).endsWith(wanted)) ?? null;
}

async function ordersView(chatId: number, page = 0) {
  const settings = await getSettings();
  const rows = await userOrders(chatId);
  const pages = Math.max(1, Math.ceil(rows.length / ORDERS_PER_PAGE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = rows.slice(current * ORDERS_PER_PAGE, current * ORDERS_PER_PAGE + ORDERS_PER_PAGE);

  const head = sectionHead(settings, "orders", `${pageIconHtml(settings, "orders")} <b>M Y   O R D E R S</b>`);
  if (!rows.length) {
    return {
      text: `${head}\n\nYou have no orders yet.`,
      kb: [
        [uiBtn(settings, "ord_refresh", "orders")],
        [uiBtn(settings, "ord_shop", "shop:0"), uiBtn(settings, "ord_home", "home")],
      ] as Button[][],
    };
  }

  const body = slice
    .map((o: any) => {
      const status = uiIconHtml(
        settings,
        o.status === "completed" ? "ord_status_done" : o.status === "cancelled" ? "ord_status_cancelled" : "ord_status_pending",
      );
      return (
        `<b>#${o.order_no ?? ""}</b> ${uiIconHtml(settings, "ord_id")} <code>${orderCode(o.id)}</code>\n` +
        `${uiIconHtml(settings, "ord_item")} <b>${escapeHtml(String(o.product_name ?? "-"))}</b>\n` +
        `${uiIconHtml(settings, "ord_time")} <i>${escapeHtml(orderTimeText(o.created_at, settings))}</i>\n` +
        `${uiIconHtml(settings, "ord_price")} ${money(o.total)} • Qty ×${o.quantity ?? 1} ${status}`
      );
    })
    .join("\n──────────────\n");

  const ordStyle = btnColor(settings, "orders");
  const ordPage = btnColor(settings, "pagination");
  const ordNav = btnColor(settings, "nav");
  const kb: Button[][] = slice.map((o: any) => [
    styled(
      {
        text: `${parseIconValue(settings["ui_icon_ord_view"] ?? "", "🔎").glyph} ${uiText(settings, "ord_view")} ${orderCode(o.id)}`.trim(),
        callback_data: `ord:v:${orderCode(o.id).replace("ORD-", "")}`,
      },
      ordStyle,
    ),
  ]);
  const nav: Button[] = [];
  if (current > 0) nav.push(styled(uiBtn(settings, "ord_prev", `ord:p:${current - 1}`), ordPage));
  nav.push(styled({ text: `${current + 1}/${pages}`, callback_data: `ord:p:${current}` }, ordPage));
  if (current < pages - 1) nav.push(styled(uiBtn(settings, "ord_next", `ord:p:${current + 1}`), ordPage));
  kb.push(nav);
  kb.push([
    styled(uiBtn(settings, "ord_refresh", `ord:p:${current}`), ordNav),
    styled(uiBtn(settings, "ord_home", "home"), ordNav),
  ]);

  return {
    text:
      `${head}\n──────────────\n${body}\n──────────────\n` +
      `<i>${escapeHtml(uiText(settings, "ord_tap_hint"))}</i>`,
    kb,
  };
}

/** One order with its credentials + download buttons. */
async function orderDetailView(chatId: number, code: string) {
  const settings = await getSettings();
  const o = await findUserOrder(chatId, code);
  if (!o) {
    return {
      text: `${uiIconHtml(settings, "ord_notfound")} ${escapeHtml(uiText(settings, "ord_notfound"))}`,
      kb: [[uiBtn(settings, "ord_back_list", "orders")]] as Button[][],
    };
  }
  const items = credentialItems(o.delivered_content);
  const shortCode = orderCode(o.id).replace("ORD-", "");

  let text =
    `${uiIconHtml(settings, "ord_detail_title")} <b>${escapeHtml(uiText(settings, "ord_detail_title"))}</b>\n\n` +
    (o.status === "completed"
      ? `<i>${escapeHtml(uiText(settings, "ord_done"))}</i>\n`
      : o.status === "cancelled"
        ? `${uiIconHtml(settings, "ord_cancelled")} <i>${escapeHtml(uiText(settings, "ord_cancelled"))}</i>\n`
        : `<i>${escapeHtml(uiText(settings, "ord_pending"))}</i>\n`) +
    `──────────────\n` +
    `${uiIconHtml(settings, "ord_id")} <b>${escapeHtml(uiText(settings, "ord_id"))}:</b> <code>${orderCode(o.id)}</code>\n` +
    `${uiIconHtml(settings, "ord_time")} <b>${escapeHtml(uiText(settings, "ord_time"))}:</b> ${escapeHtml(orderTimeText(o.created_at, settings))}\n` +
    `${uiIconHtml(settings, "ord_product")} <b>${escapeHtml(uiText(settings, "ord_product"))}:</b> ${escapeHtml(String(o.product_name ?? "-"))}\n` +
    `${uiIconHtml(settings, "ord_price")} <b>${escapeHtml(uiText(settings, "ord_price"))}:</b> ${money(o.total)} • Qty ×${o.quantity ?? 1}\n` +
    `──────────────\n`;

  if (!items.length) {
    text += `\n${uiIconHtml(settings, "ord_nocreds")} <i>${escapeHtml(uiText(settings, "ord_nocreds"))}</i>`;
  } else {
    const full =
      "\n" +
      items
        .map(
          (it, i) =>
            `${uiIconHtml(settings, "ord_cred")} <b>${escapeHtml(uiText(settings, "ord_cred"))} ${i + 1}</b>\n<code>${escapeHtml(it)}</code>`,
        )
        .join("\n\n") +
      `\n\n${uiIconHtml(settings, "ord_copy_hint")} <i>${escapeHtml(uiText(settings, "ord_copy_hint"))}</i>`;
    text +=
      text.length + full.length <= ORDER_TEXT_LIMIT
        ? full
        : `\n${uiIconHtml(settings, "ord_creds_count")} <b>${items.length}</b> ${escapeHtml(uiText(settings, "ord_creds_count"))}\n──────────────\n` +
          `${uiIconHtml(settings, "ord_dl_hint")} <i>${escapeHtml(uiText(settings, "ord_dl_hint"))}</i>`;
  }

  const kb: Button[][] = [];
  if (items.length) {
    kb.push([uiBtn(settings, "ord_download", `ord:dl:${shortCode}:full`)]);
    kb.push([uiBtn(settings, "ord_plain", `ord:dl:${shortCode}:plain`)]);
  }
  if (o.product_id) kb.push([uiBtn(settings, "ord_reorder", `p:${o.product_id}`)]);
  kb.push([uiBtn(settings, "ord_back_list", "orders")]);
  return { text, kb };
}

/** Send the order credentials as a downloadable .txt document. */
async function sendOrderFile(chatId: number, code: string, kind: "full" | "plain") {
  const settings = await getSettings();
  const o = await findUserOrder(chatId, code);
  if (!o) return;
  if (!credentialItems(o.delivered_content).length) {
    await say(chatId, "⚠️ This order has no credentials to download yet.", [
      [uiBtn(settings, "ord_back_list", "orders")],
    ]);
    return;
  }
  const brand = String(settings["bot_name"] || "QORIX").trim() || "QORIX";
  const body = kind === "plain" ? orderPlainText(o) : orderFileText(o, brand);
  const filename = orderFileName(o, kind);
  const caption = `<code>${orderCode(o.id)}</code> \u00b7 ${
    kind === "plain" ? "plain credentials" : `${credentialItems(o.delivered_content).length} items`
  }`;
  const back: Button[][] = [[uiBtn(settings, "ord_back_list", "orders")]];

  // Upload the file itself so no download URL is ever shown to the user.
  let res = await sendDocumentUpload(chatId, filename, body, caption, back);
  if (res?.ok === false) {
    const url = `${siteUrl(settings)}/api/public/order-file/${signOrderToken(o.id, kind)}/${filename}`;
    res = await sendDocument(chatId, url, caption, back);
  }
  if (res?.ok === false) {
    await say(chatId, "\u26a0\ufe0f Could not build your file right now. Please try again in a moment.", back);
  }
}


/** Subscribe / unsubscribe the user to a product restock alert. */
async function toggleStockAlert(chatId: number, productId: string) {
  const settings = await getSettings();
  const existing = await db
    .from("stock_alerts")
    .select("id")
    .eq("product_id", productId)
    .eq("telegram_id", chatId)
    .is("notified_at", null)
    .maybeSingle();
  if (existing.data) {
    await db.from("stock_alerts").delete().eq("id", existing.data.id);
    return `${uiIconHtml(settings, "prod_notify_off_msg")} ${escapeHtml(uiText(settings, "prod_notify_off_msg"))}`;
  }
  const { error } = await db
    .from("stock_alerts")
    .upsert({ product_id: productId, telegram_id: chatId, notified_at: null }, { onConflict: "product_id,telegram_id" });
  if (error) return `\u26a0\ufe0f ${escapeHtml(error.message)}`;
  return `${uiIconHtml(settings, "prod_notify_on_msg")} ${escapeHtml(uiText(settings, "prod_notify_on_msg"))}`;
}

/** Tell every waiting user that a product is back in stock. */
export async function notifyRestock(
  productId: string,
  addedQty = 0,
  delivery?: {
    channelSent?: boolean;
    dmAfter?: number;
    dmLimit?: number;
    beforeChannelSend?: () => Promise<void>;
    beforeDmSend?: (cursor: number) => Promise<void>;
  },
) {
    const { data: p } = await db.from("products").select("*").eq("id", productId).maybeSingle();
    if (!p) throw new Error("Linked product no longer exists");
    // Switched-off products are hidden everywhere, so no alerts go out for them.
    if (p.is_active === false) return;
    const settings = await getSettings();

    // Public channel post — runs even when nobody subscribed to the alert.
    const { count: freeCount } = await db
      .from("stock_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("is_sold", false);
    const available = p.supplier_id ? Number(p.supplier_stock ?? 0) : (freeCount ?? 0);
    const { data: subs } = await db
      .from("stock_alerts")
      .select("id,telegram_id")
      .eq("product_id", productId)
      .is("notified_at", null);

    // Channel post + DM to every bot user (subscribers get their own card below).
    const skipDm = delivery ? new Set<number>() : new Set<number>((subs ?? []).map((s: any) => Number(s.telegram_id)));
    const broadcast = await announceRestock(p, addedQty, available, skipDm, delivery);

    if (delivery) {
      if (broadcast?.dmComplete && subs?.length) {
        await db
          .from("stock_alerts")
          .update({ notified_at: new Date().toISOString() })
          .in("id", subs.map((s: any) => s.id));
      }
      return broadcast;
    }

    if (!subs?.length) return 0;

    const text =
      `${uiIconHtml(settings, "prod_restock")} <b>${escapeHtml(uiText(settings, "prod_restock"))}</b>\n\n` +
      `${productIconHtml(p)} <b>${escapeHtml(p.name)}</b>\n${escapeHtml(uiText(settings, "prod_price"))}: <b>${money(p.price)}</b>`;
    const kb: Button[][] = [[uiBtn(settings, "prod_restock_view", `p:${p.id}`)]];
    for (const s of subs) {
      try {
        await sendMessage(s.telegram_id, text, kb);
      } catch {
        /* ignore blocked users */
      }
    }
    await db
      .from("stock_alerts")
      .update({ notified_at: new Date().toISOString() })
      .in("id", subs.map((s: any) => s.id));
    return subs.length;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handleCallback(cq: any) {
  const chatId = cq.message?.chat?.id as number;
  const messageId = cq.message?.message_id as number;
  const data: string = cq.data ?? "";
  // Fire the spinner-stopping ack without waiting for Telegram's round trip.
  defer(() => answerCallback(cq.id));
  if (!chatId) return;
  const user = await upsertUser(cq.from);
  if (!user || user.is_banned) return;

  // Banner (photo) messages can't be edited into text — renderText replaces them.
  const fromMedia = Boolean(
    cq.message?.photo || cq.message?.video || cq.message?.animation || cq.message?.document,
  );
  const edit = async (text: string, kb?: Button[][]) => {
    await renderText(chatId, messageId, text, kb, fromMedia);
  };

  if (data === "jg:v") {
    const s = await getSettings();
    const missing = joinGateOn(s) ? await missingJoins(chatId, s) : [];
    if (missing.length) {
      const gv = joinGateView(s, missing);
      await edit(
        `❌ <b>Not joined yet.</b>\nStill missing: ${missing.map((c) => escapeHtml(c.label)).join(", ")}\n\n${gv.text}`,
        gv.kb,
      );
      return;
    }
    const okUser = await getUser(chatId);
    await edit(`✅ <b>Verified!</b>\n\n${await homeText(okUser)}`, homeKeyboard(s));
    return;
  }

  if (data === "home") {
    const fresh = await getUser(chatId);
    await edit(await homeText(fresh), homeKeyboard(await getSettings()));
    return;
  }

  if (data === "api" || data.startsWith("api:")) {
    await handleApiCallback(chatId, data, user, edit);
    return;
  }

  if (data === "adm:apiicons" || data.startsWith("adm:qi:")) {
    await handleApiIconCallback(chatId, data, user.state ?? {}, edit);
    return;
  }

  if (data === "freebies") {
    const view = await freebiesView();
    await edit(view.text, view.kb);
    return;
  }

  if (data === "flash") {
    const view = await flashView();
    await edit(view.text, view.kb);
    return;
  }

  if (data.startsWith("shop:")) {
    const page = Number(data.split(":")[1] || 0);
    const view = await shopView(page);
    await edit(view.text, view.kb);
    return;
  }

  if (data.startsWith("cat:")) {
    const [, id, pg] = data.split(":");
    const view = await allProductsView(Number(pg || 0), id || "all");
    await edit(view.text, view.kb);
    return;
  }

  if (data.startsWith("p:")) {
    defer(() => awardReferralCredit(user));
    const view = await productView(data.slice(2));
    if (!view) return;
    await showView(chatId, messageId, view, fromMedia);
    return;
  }


  if (data.startsWith("notify:")) {
    const productId = data.slice("notify:".length);
    const msg = await toggleStockAlert(chatId, productId);
    await say(chatId, msg);
    const view = await productView(productId);
    if (view) await showView(chatId, messageId, view, fromMedia);
    return;
  }

  if (data.startsWith("qty:")) {
    const productId = data.split(":")[1]!;
    const qs = await getSettings();
    const kb: Button[][] = [
      [1, 2, 3].map((n) => ({ text: `${n}×`, callback_data: `buy:${productId}:${n}` })),
      [5, 10].map((n) => ({ text: `${n}×`, callback_data: `buy:${productId}:${n}` })),
      [uiBtn(qs, "qty_custom", `cq:${productId}`)],
      [uiBtn(qs, "qty_add1", `cadd:${productId}:1`), uiBtn(qs, "qty_add5", `cadd:${productId}:5`)],
      [uiBtn(qs, "qty_back", `p:${productId}`)],
    ];
    const pv = await productView(productId);
    const qtyHead = `${uiIconHtml(qs, "qty_title")} <b>${escapeHtml(uiText(qs, "qty_title"))}</b>`;
    const head = pv
      ? `${qtyHead}\n──────────────\n${pv.product.name}\nPrice: <b>${money(pv.product.price)}</b>\n\n<i>Choose how many you want — payment options come next.</i>`
      : qtyHead;
    await edit(head, kb);
    return;
  }

  if (data === "cart") {
    const fresh = await getUser(chatId);
    const view = await cartView(fresh);
    await edit(view.text, view.kb);
    return;
  }

  if (
    data.startsWith("cadd:") ||
    data.startsWith("cinc:") ||
    data.startsWith("cdec:") ||
    data.startsWith("crm:")
  ) {
    const [op, productId, n] = data.split(":");
    const fresh = await getUser(chatId);
    const cart = readCart(fresh);
    const idx = cart.findIndex((l) => l.product_id === productId);
    if (op === "crm") {
      if (idx >= 0) cart.splice(idx, 1);
    } else if (op === "cdec") {
      if (idx >= 0) {
        cart[idx]!.qty -= 1;
        if (cart[idx]!.qty < 1) cart.splice(idx, 1);
      }
    } else {
      const add = op === "cadd" ? Math.max(1, Number(n) || 1) : 1;
      if (idx >= 0) cart[idx]!.qty = Math.min(999, cart[idx]!.qty + add);
      else cart.push({ product_id: productId!, qty: add });
    }
    await writeCart(chatId, cart);
    const updated = await getUser(chatId);
    const view = await cartView(updated);
    await edit(view.text, view.kb);
    return;
  }

  if (data === "cclear") {
    await writeCart(chatId, []);
    const updated = await getUser(chatId);
    const view = await cartView(updated);
    await edit(view.text, view.kb);
    return;
  }

  if (data === "cchk" || data === "cgo") {
    const fresh = await getUser(chatId);
    const cart = readCart(fresh);
    const view = (await startCheckout(chatId, cart)) ?? (await cartView(fresh));
    await edit(view.text, view.kb);
    return;
  }

  if (data === "co") {
    const view = await coView(chatId);
    await edit(view.text, view.kb);
    return;
  }

  if (data === "cocpn") {
    await setState(chatId, { ...(user.state ?? {}), awaiting: "coupon" });
    await edit(uiTag(await getSettings(), "com_coupon_ask"), [[uiBtn(await getSettings(), "com_back", "co")]]);
    return;
  }

  if (data === "cocrm") {
    const meta = await readCo(chatId);
    if (meta) {
      meta.coupon = null;
      await writeCo(chatId, meta);
    }
    const view = await coView(chatId);
    await edit(view.text, view.kb);
    return;
  }

  if (data === "copay") {
    const view = await coPayView(chatId);
    await edit(view.text, view.kb);
    return;
  }

  if (data.startsWith("copm:")) {
    const method = data.slice(5);
    const meta = await readCo(chatId);
    if (!meta) {
      const view = await coView(chatId);
      await edit(view.text, view.kb);
      return;
    }
    const { total } = await coTotals(meta, chatId);

    if (method === "balance") {
      const fresh = await getUser(chatId);
      if (Number(fresh.balance) < total) {
        await edit(`❌ Not enough balance (${money(fresh.balance)}). Choose another payment method.`, [
          [{ text: "⬅️ Back", callback_data: "copay" }],
        ]);
        return;
      }
      const res = await fulfillCheckout(chatId, meta, "balance", "wallet");
      await edit(res.text, res.kb);
      return;
    }

    if (method.startsWith("pk_")) {
      const pkr = await startPaykoriDeposit(chatId, method.slice(3), total, {
        items: meta.items,
        coupon: meta.coupon ?? null,
        summary: meta.summary ?? "",
        total,
      });
      if ("error" in pkr && pkr.error) {
        await edit(`❌ ${escapeHtml(pkr.error)}`, [[{ text: "⬅️ Back", callback_data: "copay" }]]);
        return;
      }
      const ps = await getSettings();
      const pv = paykoriView((pkr as any).row, ps);
      await edit(
        `${uiIconHtml(ps, "dep_order_tag")} <b>${escapeHtml(uiText(ps, "dep_order_tag"))}:</b> ${escapeHtml(meta.summary ?? "")}\n\n${pv.text}`,
        pv.kb,
      );
      return;
    }

    const kind = method === "payid" ? "payid" : "crypto";

    const network = method === "payid" ? undefined : method;
    const r = await startBinanceDeposit(chatId, kind as any, total, network, {
      items: meta.items,
      coupon: meta.coupon ?? null,
      summary: meta.summary ?? "",
      total,
    });
    if ("error" in r && r.error) {
      await edit(`❌ ${escapeHtml(r.error)}`, [[{ text: "⬅️ Back", callback_data: "copay" }]]);
      return;
    }
    const s2 = await getSettings();
    const view = binanceView((r as any).row, s2);
    await edit(
      `${uiIconHtml(s2, "dep_order_tag")} <b>${escapeHtml(uiText(s2, "dep_order_tag"))}:</b> ${escapeHtml(meta.summary ?? "")}\n\n${view.text}`,
      view.kb,
    );
    return;
  }

  if (data === "orders" || data.startsWith("ord:p:")) {
    const page = data.startsWith("ord:p:") ? Number(data.split(":")[2] || 0) : 0;
    const view = await ordersView(chatId, page);
    await edit(view.text, view.kb);
    return;
  }

  if (data.startsWith("ord:v:")) {
    const view = await orderDetailView(chatId, data.slice(6));
    await edit(view.text, view.kb);
    return;
  }

  if (data.startsWith("ord:dl:")) {
    const [, , code, kind] = data.split(":");
    await sendOrderFile(chatId, String(code), kind === "plain" ? "plain" : "full");
    return;
  }

  if (data.startsWith("cq:")) {
    await setState(chatId, { ...(user.state ?? {}), awaiting: "custom_qty", product_id: data.slice(3) });
    await say(chatId, "✏️ Send the quantity you want to buy.");
    return;
  }

  if (data.startsWith("buy:")) {
    const [, productId, n] = data.split(":");
    const view = await startCheckout(chatId, [{ product_id: productId!, qty: Math.max(1, Number(n) || 1) }]);
    if (view) await edit(view.text, view.kb);
    return;
  }


  if (data === "wallet") {
    const fresh = await getUser(chatId);
    const view = await walletView(fresh);
    await edit(view.text, view.kb);
    return;
  }

  if (data.startsWith("pkr:")) {
    const method = data.slice(4);
    const { s, cfg } = await paykoriCfg();
    const { PAYKORI_METHODS } = await import("@/lib/paykori.server");
    if (!cfg.enabled || !PAYKORI_METHODS[method]) {
      await edit("⚠️ Mobile banking deposits are currently disabled. Please use another method.", [
        [{ text: "⬅️ Wallet", callback_data: "wallet" }],
      ]);
      return;
    }
    await setState(chatId, { ...(user.state ?? {}), awaiting: "pk_amount", pk_method: method });
    await edit(
      `${uiIconHtml(s, "dep_bdt_title")} <b>${escapeHtml(PAYKORI_METHODS[method]!)}</b>\n\n` +
        `How much do you want to add? Reply with the amount in <b>USD</b>, e.g. <code>5</code>.\n` +
        `<i>Rate: 1 USD = ${cfg.rate} BDT</i>`,
      [[uiBtn(s, "com_back", "wallet")]],
    );
    return;
  }

  if (data.startsWith("pkchk:")) {
    const r = await verifyPaykoriDeposit(chatId, data.slice(6));
    await edit(r.message, r.keyboard);
    return;
  }

  if (data === "dep:binance") {

    const cfg = await binanceConfig();
    if (!cfg.active || !cfg.payid) {
      await edit("⚠️ Binance deposits are currently disabled. Please use another method.", [
        [{ text: "⬅️ Wallet", callback_data: "wallet" }],
      ]);
      return;
    }
    if (!cfg.live) {
      await setState(chatId, { ...(user.state ?? {}), awaiting: "deposit_amount", method: "Binance Pay" });
      await edit(
        `🪙 <b>Binance Pay (manual)</b>\n\nSend your payment to Pay ID:\n<code>${cfg.payAddress || "Not configured — contact support."}</code>\n\nThen reply with the <b>amount</b> you sent.`,
        [[{ text: "⬅️ Back", callback_data: "wallet" }]],
      );
      return;
    }
    await setState(chatId, { ...(user.state ?? {}), awaiting: "bin_amount", bin_kind: "payid" });
    await edit(
      `${uiIconHtml(await getSettings(), "dep_binance_title")} <b>${escapeHtml(uiText(await getSettings(), "dep_binance_title"))}</b>\n\nHow much <b>USDT</b> do you want to add?\nReply with the amount, e.g. <code>10</code>.`,
      [[uiBtn(await getSettings(), "com_back", "wallet")]],
    );
    return;
  }

  if (data === "dep:usdt") {
    const cfg = await binanceConfig();
    if (!cfg.active || !cfg.crypto || !cfg.live) {
      await edit("⚠️ Crypto deposits are currently disabled. Please use another method.", [
        [{ text: "⬅️ Wallet", callback_data: "wallet" }],
      ]);
      return;
    }
    const us = await getSettings();
    await edit(
      `${uiIconHtml(us, "dep_usdt_title")} <b>${escapeHtml(uiText(us, "dep_usdt_title"))}</b>\n\nChoose the network you will send from:`,
      [
        [uiBtn(us, "dep_bep20", "bnet:BSC")],
        [uiBtn(us, "dep_trc20", "bnet:TRX")],
        [uiBtn(us, "com_back", "wallet")],
      ],
    );
    return;
  }

  if (data.startsWith("bnet:")) {
    const network = data.slice(5);
    if (!NETWORKS[network]) return;
    await setState(chatId, { ...(user.state ?? {}), awaiting: "bin_amount", bin_kind: "crypto", bin_network: network });
    await edit(
      `${uiIconHtml(await getSettings(), "dep_net_title")} <b>${NETWORKS[network]}</b>\n\nHow much <b>USDT</b> do you want to add?\nReply with the amount, e.g. <code>10</code>.`,
      [[uiBtn(await getSettings(), "com_back", "dep:usdt")]],
    );
    return;
  }

  if (data.startsWith("btx:")) {
    const id = data.slice(4);
    await setState(chatId, { ...(user.state ?? {}), awaiting: "bin_txid", bin_dep_id: id });
    await edit(
      `${uiIconHtml(await getSettings(), "dep_txid_title")} Send the <b>Transaction ID</b> of your payment.\n\nBinance Pay → History → open the payment → copy the <b>Transaction ID / Order ID</b>.`,
      [[uiBtn(await getSettings(), "dep_wallet", "wallet")]],
    );
    return;
  }

  if (data.startsWith("bchk:")) {
    const id = data.slice(5);
    const r = await verifyBinanceDeposit(chatId, id);
    await edit(r.message, r.keyboard ?? [[uiBtn(await getSettings(), "dep_wallet", "wallet")]]);
    return;
  }

  if (data.startsWith("dep:")) {
    const method = data.slice(4);
    const info = DEPOSIT_LABEL[method];
    if (!info) return;
    const s = await getSettings();
    const address = s[info.key] || "Not configured — contact support.";
    await setState(chatId, { ...(user.state ?? {}), awaiting: "deposit_amount", method: info.name });
    await edit(
      `<b>${info.name}</b>\n\nSend your payment to:\n<code>${address}</code>\n\nThen reply with the <b>amount</b> you sent.`,
      [[{ text: "⬅️ Back", callback_data: "wallet" }]],
    );
    return;
  }


  if (data === "redeem") {
    await setState(chatId, { ...(user.state ?? {}), awaiting: "redeem" });
    await edit(uiTag(await getSettings(), "dep_redeem"), [[uiBtn(await getSettings(), "com_back", "wallet")]]);
    return;
  }

  if (data.startsWith("hist:")) {
    const page = Number(data.split(":")[1] || 0);
    const { data: rows } = await db
      .from("transactions")
      .select("*")
      .eq("telegram_id", chatId)
      .order("created_at", { ascending: false })
      .range(page * 10, page * 10 + 9);
    const hs = await getSettings();
    const lines =
      (rows ?? []).length === 0
        ? "No transactions yet."
        : (rows ?? [])
            .map(
              (t: any) =>
                `${uiIconHtml(hs, Number(t.amount) >= 0 ? "hist_in" : "hist_out")} ${money(Math.abs(t.amount))} · ${t.type} · ${new Date(t.created_at).toLocaleDateString()}`,
            )
            .join("\n");
    const nav: Button[] = [];
    if (page > 0) nav.push(uiBtn(hs, "hist_prev", `hist:${page - 1}`));
    if ((rows ?? []).length === 10) nav.push(uiBtn(hs, "hist_next", `hist:${page + 1}`));
    const kb: Button[][] = [];
    if (nav.length) kb.push(nav);
    kb.push([uiBtn(hs, "hist_wallet", "wallet")]);
    await edit(`${uiIconHtml(hs, "hist_title")} <b>${escapeHtml(uiText(hs, "hist_title"))}</b>\n\n${lines}`, kb);

    return;
  }

  if (data === "profile") {
    const fresh = await getUser(chatId);
    const v = await profileView(chatId, fresh);
    await edit(v.text, v.kb);
    return;
  }

  if (data === "refstore") {
    const fresh = await getUser(chatId);
    const v = await refStoreView(fresh);
    await edit(v.text, v.kb);
    return;
  }

  if (data === "refearn") {
    const fresh = await getUser(chatId);
    const v = await referralView(fresh);
    await edit(v.text, v.kb);
    return;
  }

  if (data === "refbought") {
    const fresh = await getUser(chatId);
    const v = await refPurchasesView(fresh);
    await edit(v.text, v.kb);
    return;
  }

  if (data === "refcash") {
    const fresh = await getUser(chatId);
    const v = await redeemRefCredits(fresh);
    await edit(v.text, v.kb);
    return;
  }

  if (data.startsWith("refbuy:")) {
    const fresh = await getUser(chatId);
    const v = await claimRefReward(fresh, data.slice(7));
    await edit(v.text, v.kb);
    return;
  }

  if (data.startsWith("sup:")) {
    if (await handleSupportCallback(chatId, data, user, edit)) return;
  }

  if (data === "support") {
    const v = await supportView();
    await edit(v.text, v.kb);
    return;
  }

  if (data === "ref:list") {
    const fresh = await getUser(chatId);
    const v = await referralListView(fresh);
    await edit(v.text, v.kb);
    return;
  }

  if (data === "tiers") {
    const fresh = await getUser(chatId);
    const v = await tiersView(fresh);
    await edit(v.text, v.kb);
    return;
  }

  if (data.startsWith("page:")) {
    const key = data.slice(5);
    const s = await getSettings();
    await edit(s[key] || "Coming soon.", [[uiBtn(await getSettings(), "com_home", "home")]]);
    return;
  }

  if (data === "clear") {
    const state = (user.state ?? {}) as any;
    const tracked: number[] = Array.isArray(state.msgs) ? state.msgs : [];

    // Wipe every message we can reach: tracked bot messages + a full sweep of
    // recent IDs in this chat (covers the user's own messages too).
    const ids = new Set<number>(tracked);
    for (let i = 0; i <= 200; i++) ids.add(messageId - i);

    const list = [...ids].filter((id) => id > 0).sort((a, b) => b - a);
    for (let i = 0; i < list.length; i += 20) {
      await Promise.all(
        list.slice(i, i + 20).map((id) => deleteMessage(chatId, id).catch(() => undefined)),
      );
    }

    msgsCache.set(chatId, []);
    await setState(chatId, { ...state, msgs: [] });
    const fresh = await getUser(chatId);
    await say(chatId, await homeText(fresh), homeKeyboard(await getSettings()));
    return;
  }

  if (data.startsWith("adm:")) {
    if (!(await isAdmin(chatId))) return;
    const action = data.slice(4);
    const arg = action.split(":")[1] ?? "";
    const st = (user.state ?? {}) as any;

    if (action === "tk") {
      const v = await admTicketsView();
      await edit(v.text, v.kb);
    } else if (action.startsWith("tk:")) {
      const id = action.slice(3);
      await db.from("support_tickets").update({ unread_admin: 0 }).eq("id", id);
      const v = await ticketView(id, "admin");
      await edit(v.text, v.kb);
    } else if (action.startsWith("tkr:")) {
      const id = action.slice(4);
      await setState(chatId, { ...st, awaiting: "adm_tk_reply", adm_ticket: id });
      await edit("✍️ Send your reply — it goes straight to the customer's inbox.", [
        [{ text: "⛔️ Cancel", callback_data: `adm:tk:${id}` }],
      ]);
    } else if (action.startsWith("tkc:") || action.startsWith("tko:")) {
      const id = action.slice(4);
      await setTicketStatus(id, action.startsWith("tkc:") ? "closed" : "open", "admin");
      const v = await ticketView(id, "admin");
      await edit(v.text, v.kb);
    } else if (action === "stats") {
      await edit(await adminStatsText(), adminKeyboard());
    } else if (action === "orders") {
      const v = await admOrdersView();
      await edit(v.text, v.kb);
    } else if (action === "porder") {
      const v = await admProductOrderView(0);
      await edit(v.text, v.kb);
    } else if (action.startsWith("sopg:")) {
      const v = await admProductOrderView(Number(action.split(":")[1]) || 0);
      await edit(v.text, v.kb);
    } else if (action.startsWith("soup:") || action.startsWith("sodn:") || action.startsWith("sotop:")) {
      const parts = action.split(":");
      const productId = parts[1] ?? "";
      const page = Number(parts[2]) || 0;
      const direction = action.startsWith("soup:") ? "up" : action.startsWith("sodn:") ? "down" : "top";
      await moveProductOrder(productId, direction);
      const v = await admProductOrderView(page);
      await edit(v.text, v.kb);
    } else if (action.startsWith("sopos:")) {
      await setState(chatId, { ...st, awaiting: "adm_prod_block", adm_product: arg, adm_block: "sort_order" });
      await say(chatId, "🔢 Send the new product serial number. Smaller numbers appear first. Send <code>-</code> for automatic ordering.");
    } else if (action.startsWith("o:")) {
      const v = await admOrderView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("ar:")) {
      await say(chatId, "🔁 Retrying automatic delivery via the supplier API…");
      const { retrySupplierDelivery } = await import("@/lib/suppliers/fulfil.server");
      const r = await retrySupplierDelivery(arg);
      await say(
        chatId,
        r.ok
          ? `✅ Auto delivery succeeded — ${r.items?.length ?? 0} item(s) sent to the buyer.`
          : `❌ Auto delivery still failing:\n<code>${escapeHtml(r.reason ?? "Unknown error")}</code>`,
      );
      const v = await admOrderView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("od:")) {
      await setState(chatId, { ...st, awaiting: "adm_deliver", adm_order: arg });
      await say(chatId, "🚚 Send the content to deliver to the buyer.");
    } else if (action.startsWith("oc:")) {
      const { data: o } = await db.from("orders").select("*").eq("id", arg).maybeSingle();
      if (o && o.status === "pending") {
        await db.from("orders").update({ status: "cancelled" }).eq("id", arg);
        const u = await getUser(o.telegram_id);
        await db
          .from("bot_users")
          .update({ balance: Number(u?.balance ?? 0) + Number(o.total) })
          .eq("telegram_id", o.telegram_id);
        await db.from("transactions").insert({
          telegram_id: o.telegram_id,
          type: "refund",
          amount: o.total,
          note: `Order #${o.order_no} cancelled`,
        });
        await sendMessage(
          o.telegram_id,
          `❌ Order #${o.order_no} was cancelled. ${money(o.total)} refunded to your balance.`,
        );
      }
      const v = await admOrdersView();
      await edit(v.text, v.kb);
    } else if (action === "pays") {
      const v = await admPaymentsView();
      await edit(v.text, v.kb);
    } else if (action.startsWith("pay:")) {
      const v = await admPaymentView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("pa:") || action.startsWith("pr:")) {
      const msgTxt = await admDecidePayment(arg, action.startsWith("pa:"));
      const v = await admPaymentsView();
      await edit(`${msgTxt}\n\n${v.text}`, v.kb);
    } else if (action === "user") {
      await setState(chatId, { ...st, awaiting: "adm_find" });
      await say(chatId, "👤 Send the telegram ID or @username.");
    } else if (action.startsWith("ub:")) {
      await setState(chatId, { ...st, awaiting: "adm_addbal_user", adm_target: Number(arg) });
      await say(chatId, "➕ Send the amount (negative to deduct).");
    } else if (action.startsWith("um:")) {
      await setState(chatId, { ...st, awaiting: "adm_msg_user", adm_target: Number(arg) });
      await say(chatId, "✉️ Send the message text.");
    } else if (action.startsWith("ux:")) {
      const target = await getUser(Number(arg));
      if (target) {
        await db
          .from("bot_users")
          .update({ is_banned: !target.is_banned })
          .eq("telegram_id", target.telegram_id);
      }
      const v = await admUserView(Number(arg));
      await edit(v.text, v.kb);
    } else if (action === "jg") {
      const v = await admJoinGateView();
      await edit(v.text, v.kb);
    } else if (action === "jgt") {
      const s = await getSettings();
      const on = (s["join_gate"] ?? "off").toLowerCase() === "on";
      await upsertSetting({ key: "join_gate", value: on ? "off" : "on" }, { onConflict: "key" });
      const v = await admJoinGateView();
      await edit(v.text, v.kb);
    } else if (action === "jgadd") {
      await setState(chatId, { ...st, awaiting: "adm_jg_add" });
      await say(
        chatId,
        "➕ Send the channel like <code>@mychannel</code>, or for private chats " +
          "<code>-1001234567890|My Channel|https://t.me/+invitelink</code>.\n\n" +
          "Make this bot an <b>admin</b> in that chat first. Send <code>-</code> to cancel.",
        [[{ text: "✖️ Cancel", callback_data: "adm:jg" }]],
      );
    } else if (action.startsWith("jgdel:")) {
      const s = await getSettings();
      const lines = (s["join_channels"] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      lines.splice(Number(action.split(":")[1]) || 0, 1);
      await upsertSetting({ key: "join_channels", value: lines.join("\n") }, { onConflict: "key" });
      const v = await admJoinGateView();
      await edit(v.text, v.kb);
    } else if (action === "jgtest") {
      const s = await getSettings();
      const lines: string[] = [];
      for (const c of joinChannels(s)) {
        const r = await tg("getChatMember", { chat_id: c.chat, user_id: chatId });
        lines.push(
          r?.ok
            ? `✅ <code>${escapeHtml(c.chat)}</code> → ${escapeHtml(String(r.result?.status ?? "?"))}`
            : `⚠️ <code>${escapeHtml(c.chat)}</code> → ${escapeHtml(r?.description ?? "cannot check (make the bot admin)")}`,
        );
      }
      const v = await admJoinGateView();
      await edit(`${lines.join("\n") || "No channels."}\n\n${v.text}`, v.kb);
    } else if (action === "ann") {
      const v = await admAnnounceView();
      await edit(v.text, v.kb);
    } else if (action === "anid") {
      await setState(chatId, { ...st, awaiting: "adm_ann_chat" });
      await say(
        chatId,
        "🆔 Send the channel/group <b>ID</b> now (e.g. <code>-1001234567890</code>).\n\n" +
          "Add <code>@userinfobot</code> to that chat to read the ID, and make this bot an admin there. Send <code>-</code> to clear.",
      );
    } else if (action.startsWith("antg:")) {
      const key =
        arg === "restock"
          ? "announce_restock"
          : arg === "dm"
            ? "announce_dm"
            : "announce_sales";
      const s = await getSettings();
      await upsertSetting({ key, value: annOn(s, key) ? "off" : "on" }, { onConflict: "key" });
      const v = await admAnnounceView();
      await edit(v.text, v.kb);
    } else if (action === "anmsg") {
      await setState(chatId, { ...st, awaiting: "adm_ann_post" });
      await say(
        chatId,
        "✍️ Send the announcement text (or a photo with caption). It will be posted to your channel/group as-is.",
        [[{ text: "✖️ Cancel", callback_data: "adm:ann" }]],
      );
    } else if (action === "antest") {
      const s = await getSettings();
      if (!s["announce_chat_id"]) {
        await say(chatId, "⚠️ Set the channel/group ID first.", [[{ text: "⬅️ Back", callback_data: "adm:ann" }]]);
      } else {
        await postToChannel(s, "🧪 <b>Test post</b>\nAnnouncements are wired up correctly.");
        await say(chatId, "✅ Test post sent. Check your channel/group.", [
          [{ text: "⬅️ Back", callback_data: "adm:ann" }],
        ]);
      }
    } else if (action.startsWith("pdsc:")) {
      const v = await admStockView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("pdsl:")) {
      const { data: rows } = await db
        .from("stock_items")
        .select("content,is_sold,created_at")
        .eq("product_id", arg)
        .order("created_at", { ascending: false })
        .limit(5);
      const body = (rows ?? [])
        .map((r: any, i: number) => `${i + 1}. ${r.is_sold ? "💤" : "✅"} <pre>${escapeHtml(String(r.content).slice(0, 120))}</pre>`)
        .join("\n");
      await say(chatId, body || "No stock items yet.", [
        [{ text: "⬅️ Stock manager", callback_data: `adm:pdsc:${arg}` }],
      ]);
    } else if (action.startsWith("pdsm:")) {
      const { data: one } = await db
        .from("stock_items")
        .select("id")
        .eq("product_id", arg)
        .eq("is_sold", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (one) await db.from("stock_items").delete().eq("id", one.id);
      const v = await admStockView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("pdsx:")) {
      await db.from("stock_items").delete().eq("product_id", arg).eq("is_sold", false);
      const v = await admStockView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("pdrs:")) {
      await notifyRestock(arg, 0);
      const v = await admStockView(arg);
      await edit(`✅ Restock post sent.\n\n${v.text}`, v.kb);
    } else if (action === "stock") {
      const v = await admPickView("stock", 0, pickQuery(st, "stock"));
      await edit(v.text, v.kb);
    } else if (action === "icons") {
      const v = await admPickView("icon", 0, pickQuery(st, "icon"));
      await edit(v.text, v.kb);
    } else if (action === "iconsoff") {
      const v = await admPickView("iconoff", 0, pickQuery(st, "iconoff"));
      await edit(v.text, v.kb);
    } else if (action === "alerticons") {
      const v = await admAlertIconView();
      await edit(v.text, v.kb);
    } else if (action.startsWith("ai:")) {
      const alertKey = arg as AlertIconKey;
      if (!(alertKey in ALERT_ICONS)) return;
      await setState(chatId, { ...st, awaiting: "adm_alert_icon", adm_alert_icon: alertKey });
      await say(
        chatId,
        `🚨 Send the new icon for <b>${ALERT_ICONS[alertKey][1]}</b>.\n\nNormal emoji or Telegram Premium custom emoji both work. Send <code>-</code> to reset.`,
      );
    } else if (
      action.startsWith("pgi:") ||
      action.startsWith("pgio:") ||
      action.startsWith("pgd:") ||
      action.startsWith("pgs:")
    ) {
      const kind: PickKind = action.startsWith("pgio:")
        ? "iconoff"
        : action.startsWith("pgi:")
          ? "icon"
          : action.startsWith("pgd:")
            ? "detail"
            : "stock";
      const v = await admPickView(kind, Number(arg) || 0, pickQuery(st, kind));
      await edit(v.text, v.kb);

    } else if (action.startsWith("fnd:")) {
      const kind = arg as PickKind;
      if (!(kind in PICK_CFG)) return;
      await setState(chatId, { ...st, awaiting: "adm_pick_search", adm_pick_kind: kind });
      await say(chatId, "🔎 Send part of the product name to search.");
    } else if (action.startsWith("clr:")) {
      const kind = arg as PickKind;
      if (!(kind in PICK_CFG)) return;
      await setState(chatId, { ...st, adm_pick_q: { ...(st.adm_pick_q ?? {}), [kind]: "" } });
      const v = await admPickView(kind, 0, "");
      await edit(v.text, v.kb);

    } else if (action === "pageicons") {
      const v = await admPageIconView();
      await edit(v.text, v.kb);
    } else if (action === "caticons") {
      const v = await admCategoryIconView();
      await edit(v.text, v.kb);
    } else if (action === "bcolors") {
      const v = await admButtonColorView();
      await edit(v.text, v.kb);
    } else if (action.startsWith("bc:")) {
      const slot = arg as ColorSlot;
      if (!COLOR_SLOTS.some((s) => s.key === slot)) return;
      const settings = await getSettings();
      const next = COLOR_ORDER[(COLOR_ORDER.indexOf(btnColor(settings, slot)) + 1) % COLOR_ORDER.length]!;
      await saveIconSetting(`btn_color_${slot}`, next);
      const v = await admButtonColorView();
      await edit(v.text, v.kb);
    } else if (action.startsWith("ci:")) {
      const catId = arg;
      if (!catId) return;
      await setState(chatId, { ...st, awaiting: "adm_cat_icon", adm_cat_icon: catId });
      await say(
        chatId,
        "🗂 Send the new icon for this category.\n\nNormal emoji or <b>Telegram Premium custom emoji</b> both work (sticker or numeric id too). Send <code>-</code> to reset.",
      );

    } else if (action === "ui") {
      const v = await admUiGroupView();
      await edit(v.text, v.kb);
    } else if (action === "paymenticons") {
      const v = await admPaymentIconsView();
      await edit(v.text, v.kb);
    } else if (action.startsWith("uig:")) {
      const v = await admUiListView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("uie:")) {
      if (!(arg in UI_ELEMENTS)) return;
      const v = await admUiItemView(arg as UiKey);
      await edit(v.text, v.kb);
    } else if (action.startsWith("uii:") || action.startsWith("uit:")) {
      if (!(arg in UI_ELEMENTS)) return;
      const wantIcon = action.startsWith("uii:");
      await setState(chatId, {
        ...st,
        awaiting: wantIcon ? "adm_ui_icon" : "adm_ui_text",
        adm_ui_key: arg,
      });
      await say(
        chatId,
        wantIcon
          ? `🎨 Send the new icon for <b>${escapeHtml(UI_ELEMENTS[arg as UiKey].label)}</b>.\n\nNormal emoji or Telegram Premium custom emoji both work. Send <code>-</code> to reset.`
          : `✏️ Send the new text for <b>${escapeHtml(UI_ELEMENTS[arg as UiKey].label)}</b>.\n\nSend <code>-</code> to restore the default text.`,
      );
    } else if (action.startsWith("uir:")) {
      if (!(arg in UI_ELEMENTS)) return;
      await upsertSetting({ key: `ui_icon_${arg}`, value: "" }, { onConflict: "key" });
      await upsertSetting({ key: `ui_text_${arg}`, value: "" }, { onConflict: "key" });
      const v = await admUiItemView(arg as UiKey);
      await edit(v.text, v.kb);
    } else if (action === "heads") {
      const v = await admSectionHeadView();
      await edit(v.text, v.kb);
    } else if (action.startsWith("hd:")) {
      const headKey = arg as SectionHeadKey;
      if (!(headKey in SECTION_HEADS)) return;
      await setState(chatId, { ...st, awaiting: "adm_page_head", adm_page_head: headKey });
      await say(
        chatId,
        `🔠 Send the new header for <b>${escapeHtml(SECTION_HEADS[headKey])}</b>.\n\n` +
          "Type the Premium emoji letters (or any emoji / text) in one message — it is stored exactly as sent. " +
          "Send <code>-</code> to restore the default header.",
      );
    } else if (action.startsWith("pi:")) {
      const pageKey = arg as PageIconKey;
      if (!(pageKey in PAGE_ICONS)) return;
      await setState(chatId, { ...st, awaiting: "adm_page_icon", adm_page_icon: pageKey });
      await say(
        chatId,
        `🖼 Send the new header icon for <b>${PAGE_ICONS[pageKey][1]}</b>.\n\nNormal emoji or Telegram Premium custom emoji both work. Send <code>-</code> to reset.`,
      );
    } else if (action === "npw") {
      await setState(chatId, { ...st, awaiting: "np_name", np: {} });
      await say(chatId, "🆕 <b>New product · step 1/6</b>\n\nSend the product <b>name</b>.", [
        [{ text: "✖️ Cancel", callback_data: "adm:stats" }],
      ]);
    } else if (action.startsWith("npd:")) {
      const d = { ...(st.np ?? {}), delivery_type: arg === "manual" ? "manual" : "auto" } as ProdDraft;
      await setState(chatId, { ...st, awaiting: null, np: d });
      const v = await admWizardCategoryView(d);
      await edit(v.text, v.kb);
    } else if (action.startsWith("npc:")) {
      const d = { ...(st.np ?? {}), category_id: arg === "none" ? null : arg } as ProdDraft;
      await setState(chatId, { ...st, awaiting: null, np: null });
      await admCreateProduct(chatId, d);
    } else if (action === "menuicons") {
      const v = await admMenuIconView();
      await edit(v.text, v.kb);
    } else if (action.startsWith("mi:")) {
      const menuKey = arg as MenuIconKey;
      if (!(menuKey in MENU_ICONS)) return;
      await setState(chatId, { ...st, awaiting: "adm_menu_icon", adm_menu_icon: menuKey });
      await say(chatId, `🧩 Send the new icon for <b>${MENU_ICONS[menuKey][1]}</b>.\n\nPremium custom emoji and normal emoji both work. Send <code>-</code> to reset.`);
    } else if (action.startsWith("ip:")) {
      await setState(chatId, { ...st, awaiting: "adm_icon", adm_product: arg });
      await say(
        chatId,
        "🎨 Send the icon for this product now.\n\nA normal emoji or a <b>Premium custom emoji</b> both work. Send <code>-</code> to reset to 📦.",
      );

    } else if (action === "pdetails") {
      const v = await admPickView("detail", 0, pickQuery(st, "detail"));
      await edit(v.text, v.kb);

    } else if (action.startsWith("pd:")) {
      const v = await admDetailView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("pdf:")) {
      const [, key = "", pid = ""] = action.split(":");
      const f = PROD_FIELDS[key];
      if (!f) return;
      await setState(chatId, { ...st, awaiting: "adm_prod_block", adm_product: pid, adm_block: key });
      await say(
        chatId,
        f.kind === "image"
          ? `${f.icon} Send the new <b>banner image</b> — upload a photo or paste an https image URL. Send <code>-</code> to clear.`
          : f.kind === "number"
            ? `${f.icon} Send the new <b>${f.label}</b> as a number, e.g. <code>4.5</code>. Send <code>-</code> to clear.`
            : `${f.icon} Send the new <b>${f.label}</b> text now.\n\nEmojis and multiple lines are supported. Send <code>-</code> to clear it.`,
      );
    } else if (action.startsWith("pdt:")) {
      const { data: p } = await db.from("products").select("delivery_type").eq("id", arg).maybeSingle();
      const next = p?.delivery_type === "manual" ? "auto" : "manual";
      await db.from("products").update({ delivery_type: next }).eq("id", arg);
      const v = await admDetailView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("pda:")) {
      const { data: p } = await db.from("products").select("is_active").eq("id", arg).maybeSingle();
      await db.from("products").update({ is_active: p?.is_active === false }).eq("id", arg);
      const v = await admDetailView(arg);
      await edit(v.text, v.kb);
    } else if (action.startsWith("pdd:") || action.startsWith("pdi:") || action.startsWith("pdg:")) {
      const field = action.startsWith("pdd:")
        ? "description"
        : action.startsWith("pdi:")
          ? "important_note"
          : "quick_guide";
      await setState(chatId, { ...st, awaiting: "adm_prod_block", adm_product: arg, adm_block: field });
      await say(
        chatId,
        `✍️ Send the new <b>${field === "description" ? "description" : field === "important_note" ? "important note" : "quick guide"}</b> text now.\n\n` +
          "Emojis and multiple lines are supported. Send <code>-</code> to clear it.",
      );

    } else if (action.startsWith("sp:")) {
      await setState(chatId, { ...st, awaiting: "adm_stock", adm_product: arg });
      await say(
        chatId,
        "📦 <b>Bulk stock upload</b> — paste in any of these formats:\n\n" +
          "1️⃣ One item per line: <code>PROMO-A1B2</code>\n" +
          "2️⃣ <code>email:password</code>\n" +
          "3️⃣ <code>email | password | note</code>\n" +
          "4️⃣ CSV: <code>email,password,note</code>\n" +
          "5️⃣ Multi-line blocks separated by <code>---</code>\n" +
          "6️⃣ JSON array\n\n" +
          "<i>Buyers get each item as its own message — “1 of 2”, “2 of 2”…</i>",
      );
    } else if (action === "code") {
      await setState(chatId, { ...st, awaiting: "adm_code" });
      await say(chatId, "🎁 Send the code value, e.g. <code>10</code>");
    } else if (action === "broadcast") {
      await setState(chatId, { ...st, awaiting: "broadcast" });
      await say(
        chatId,
        "📢 Send the broadcast now — text, or a <b>photo with caption</b> (image supported).",
      );
    } else if (action === "addbal") {
      await setState(chatId, { ...st, awaiting: "addbal" });
      await say(chatId, "➕ Send: <code>telegram_id amount</code>");
    } else if (action === "newprod") {
      await setState(chatId, { ...st, awaiting: "adm_newprod" });
      await say(
        chatId,
        "🆕 <b>New product</b>\n\nSend one line:\n<code>icon | name | price | auto/manual</code>\n\n" +
          "Example:\n<code>🤖 | Gemini AI Pro 18m | 4.5 | auto</code>\n\n" +
          "The icon can be a Premium custom emoji too.",
      );
    }

    return;
  }
}

/* ------------------------------------------------- reseller auto top-up */
/*
 * Resellers top their wallet up through the exact same gateways as bot users
 * (Binance Pay, on-chain USDT, Pay Kori bKash/Nagad/Rocket). The deposit rows
 * live in `binance_deposits` with `meta.reseller_id`, and `settlePayment()`
 * routes the credit to the reseller wallet instead of a bot wallet.
 */

export type ResellerTopupMethod = { id: string; label: string; kind: "payid" | "crypto" | "paykori"; note?: string };

export async function resellerTopupMethods(): Promise<ResellerTopupMethod[]> {
  const s = await getSettings();
  const cfg = await binanceConfig();
  const out: ResellerTopupMethod[] = [];
  if (cfg.active && cfg.payid && (s["binance_pay"] || "").trim())
    out.push({ id: "payid", label: "Binance Pay", kind: "payid", note: "Instant, auto-verified" });
  if (cfg.active && cfg.crypto && cfg.live) {
    out.push({ id: "BSC", label: "USDT BEP-20 (BSC)", kind: "crypto", note: "On-chain, auto-verified" });
    out.push({ id: "TRX", label: "USDT TRC-20 (Tron)", kind: "crypto", note: "On-chain, auto-verified" });
  }
  const { paykoriConfig, PAYKORI_METHODS } = await import("@/lib/paykori.server");
  const pk = paykoriConfig(s);
  if (pk.enabled) {
    for (const m of pk.methods) {
      out.push({ id: m, label: PAYKORI_METHODS[m] ?? m, kind: "paykori", note: `1 USD = ${pk.rate} BDT` });
    }
  }
  return out;
}

export async function startResellerTopup(resellerId: string, method: string, usd: number) {
  const amount = Math.round(Number(usd) * 100) / 100;
  if (!(amount > 0)) return { error: "Enter a valid amount." };
  const methods = await resellerTopupMethods();
  const picked = methods.find((m) => m.id === method);
  if (!picked) return { error: "This payment method is not available right now." };

  const meta = { reseller_id: resellerId, purpose: "reseller_topup" };

  if (picked.kind === "paykori") {
    const r = await startPaykoriDeposit(0, picked.id, amount, meta);
    if ((r as any).error) return { error: (r as any).error };
    const row: any = (r as any).row;
    return {
      deposit: {
        id: row.id,
        kind: "paykori",
        method: picked.label,
        amount_usdt: Number(row.amount_usdt),
        bdt: Number((row.meta ?? {}).bdt ?? 0),
        pay_url: String(row.address),
        address: null,
        network: row.network,
        expires_at: row.expires_at,
      },
    };
  }

  const r = await startBinanceDeposit(0, picked.kind, amount, picked.kind === "crypto" ? picked.id : undefined, meta);
  if ((r as any).error) return { error: (r as any).error };
  const row: any = (r as any).row;
  return {
    deposit: {
      id: row.id,
      kind: row.kind,
      method: picked.label,
      amount_usdt: Number(row.amount_usdt),
      bdt: 0,
      pay_url: null,
      address: String(row.address),
      network: row.network,
      expires_at: row.expires_at,
    },
  };
}

function plain(msg: string) {
  return String(msg || "").replace(/<[^>]+>/g, "");
}

export async function verifyResellerTopup(resellerId: string, depositId: string) {
  const { data: row } = await db
    .from("binance_deposits")
    .select("*")
    .eq("id", depositId)
    .eq("meta->>reseller_id", resellerId)
    .maybeSingle();
  if (!row) return { ok: false as const, message: "Payment request not found." };
  if (row.status === "credited") return { ok: true as const, message: "This payment was already credited." };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.from("binance_deposits").update({ status: "expired" }).eq("id", row.id);
    return { ok: false as const, message: "This payment request expired. Please start a new one." };
  }

  if (row.kind === "paykori") {
    const trx = row.tx_id || (row.meta as any)?.trx;
    if (!trx) return { ok: false as const, message: "No gateway confirmation yet. Finish the payment, then check again." };
    const r = await creditPaykoriRow(row, String(trx));
    return r.credited ? { ok: true as const, message: plain(r.message) } : { ok: false as const, message: plain(r.message) };
  }

  const { findCryptoDeposit, findPayTransaction } = await import("@/lib/binance.server");
  const expected = Number(row.amount_usdt);
  const result =
    row.kind === "payid" ? await findPayTransaction(expected, txUsed) : await findCryptoDeposit(expected, row.network, txUsed);
  if (!result.ok) {
    return {
      ok: false as const,
      message: `Not confirmed yet. Make sure you sent exactly ${expected.toFixed(4)} USDT, then check again in a minute.`,
    };
  }
  const { error: usedErr } = await db.from("binance_used_txs").insert({ tx_id: result.txId });
  if (usedErr) return { ok: false as const, message: "Payment not found yet. Please try again." };
  const r = await settlePayment(0, row, Number(result.amount), result.txId!, "Auto-verified via Binance API");
  return { ok: true as const, message: plain(r.message) };
}

export async function listResellerDeposits(resellerId: string) {
  const { data } = await db
    .from("binance_deposits")
    .select("id,kind,network,amount_usdt,status,tx_id,created_at,expires_at,address,meta")
    .eq("meta->>reseller_id", resellerId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

/* ------------------------------------------------ in-bot Reseller API panel */
/*
 * A bot user can open a full reseller API account straight from the bot:
 * balance, live key, API orders, docs and a low-balance alert. Every icon on
 * this panel is admin-configurable (normal or Telegram Premium custom emoji)
 * from /admin → API icons.
 */

function newApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "qxr_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function maskKey(key: string) {
  const k = String(key || "");
  return k.length > 12 ? `${k.slice(0, 8)}…${k.slice(-4)}` : k;
}

async function resellerForTelegram(telegramId: number) {
  const { data } = await db.from("resellers").select("*").eq("telegram_id", telegramId).maybeSingle();
  return data;
}

async function apiPanelView(user: any) {
  const s = await getSettings();
  const r = await resellerForTelegram(Number(user.telegram_id));

  if (!r) {
    return {
      text:
        `${sectionHead(s, "api", `${apiIcon(s, "panel")} <b>R E S E L L E R   A P I</b>`)}\n` +
        `──────────────\n` +
        `Sell our whole catalogue from <b>your own website or bot</b>.\n\n` +
        `${apiIcon(s, "balance")} Your API balance pays the wholesale price\n` +
        `${apiIcon(s, "orders")} Orders are delivered instantly through the API\n` +
        `${apiIcon(s, "key")} You get a private API key in one tap\n\n` +
        `<i>Open your free API account below.</i>`,
      kb: [
        [styled(apiBtn(s, "key", "Create API Account", "api:new"), btnColor(s, "api"))],
        [styled({ text: "📖 API Docs", url: `${siteUrl(s)}/reseller/docs` }, btnColor(s, "api"))],
        [uiBtn(s, "com_home", "home")],
      ] as Button[][],
    };
  }

  const { count: orderCount } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("reseller_id", r.id);
  const { data: spentRows } = await db.from("orders").select("total").eq("reseller_id", r.id);
  const spent = (spentRows ?? []).reduce((sum: number, o: any) => sum + Number(o.total ?? 0), 0);
  const alert = Number(r.low_bal_alert ?? 0);

  const text =
    `${sectionHead(s, "api", `${apiIcon(s, "panel")} <b>R E S E L L E R   A P I</b>`)}\n` +
    `──────────────\n` +
    `${apiIcon(s, "account")} <i>Account</i>   <b>${escapeHtml(r.name)}</b> <code>#${r.account_no ?? "—"}</code>\n` +
    `${apiIcon(s, "status")} <i>Status</i>   <b>${r.is_active ? "Active" : "Revoked"}</b>\n` +
    `${apiIcon(s, "balance")} <i>API Balance</i>   <b>${money(r.balance)}</b>\n` +
    `${apiIcon(s, "discount")} <i>Discount</i>   ${Number(r.discount_percent ?? 0) > 0 ? `<b>${Number(r.discount_percent)}%</b> off retail` : "custom pricing"}\n` +
    `${apiIcon(s, "orders")} <i>API Orders</i>   <b>${orderCount ?? 0}</b> (${money(spent)} total)\n` +
    `${apiIcon(s, "key")} <i>API Key</i>   <code>${escapeHtml(maskKey(r.api_key))}</code>\n` +
    `${apiIcon(s, "alert")} <i>Low-Bal Alert</i>   ${alert > 0 ? `<b>${money(alert)}</b>` : "off"}\n` +
    `──────────────\n` +
    `<i>Move funds from your bot wallet (${money(user.balance)}) to your API balance below.</i>`;

  const apiStyle = btnColor(s, "api");
  const aBtn = (b: Button) => styled(b, apiStyle);
  const kb: Button[][] = [
    [aBtn(apiBtn(s, "topup", "Top Up API Balance", "api:topup"))],
    [aBtn(apiBtn(s, "prices", "My Prices", "api:prices")), aBtn(apiBtn(s, "orders", "API Orders", "api:orders"))],
    [aBtn({ text: "📖 API Docs", url: `${siteUrl(s)}/reseller/docs` })],
    [aBtn(apiBtn(s, "regen", "Regenerate Key", "api:regen")), aBtn(apiBtn(s, "revoke", r.is_active ? "Revoke Key" : "Re-activate Key", "api:revoke"))],
    [aBtn(apiBtn(s, "alert", `Low Balance Alert (${alert > 0 ? money(alert) : "off"})`, "api:alert"))],
    [aBtn(apiBtn(s, "key", "Show Full Key", "api:key"))],
    [uiBtn(s, "com_home", "home")],
  ];
  return { text, kb };
}

async function createBotReseller(user: any) {
  const existing = await resellerForTelegram(Number(user.telegram_id));
  if (existing) return existing;
  const s = await getSettings();
  const name =
    `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
    (user.username ? `@${user.username}` : `TG ${user.telegram_id}`);
  const { data, error } = await db
    .from("resellers")
    .insert({
      name,
      telegram_id: Number(user.telegram_id),
      api_key: newApiKey(),
      discount_percent: Math.max(0, Math.min(90, Number(s["reseller_default_discount"] ?? 0) || 0)),
      allow_bot: true,
      allow_website: true,
      is_active: true,
      notes: "Created from the Telegram bot",
    })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Move money from the bot wallet into the reseller API balance. */
async function apiTopupFromWallet(user: any, usd: number) {
  const amount = Math.round(Number(usd) * 100) / 100;
  if (!(amount > 0)) return { error: "Enter a valid amount, e.g. 5" };
  const r = await resellerForTelegram(Number(user.telegram_id));
  if (!r) return { error: "No API account yet." };
  if (Number(user.balance ?? 0) + 1e-9 < amount)
    return { error: `Your bot wallet has only ${money(user.balance)}. Top the wallet up first.` };

  const { data: debit, error: debitError } = await db.rpc("bot_user_debit", {
    _telegram_id: Number(user.telegram_id),
    _amount: amount,
    _method: "wallet",
    _reference: `api-topup-${r.id}`,
    _note: "Transfer to reseller API balance",
  });
  if (debitError || (debit && (debit as any).ok === false))
    return { error: (debitError?.message ?? (debit as any)?.error) || "Wallet debit failed." };

  const { error: creditError } = await db.rpc("reseller_adjust_balance", {
    _reseller_id: r.id,
    _amount: amount,
    _type: "topup",
    _reference: `tg-${user.telegram_id}`,
    _note: "Transferred from bot wallet",
  });
  if (creditError) {
    // Put the money back so nothing is lost.
    await db.rpc("bot_user_debit", {
      _telegram_id: Number(user.telegram_id),
      _amount: -amount,
      _method: "wallet",
      _reference: `api-topup-refund-${r.id}`,
      _note: "API top-up failed — refunded",
    });
    return { error: creditError.message || "Top-up failed. Nothing was charged." };
  }
  return { ok: true as const, amount };
}

async function apiPricesView(user: any) {
  const s = await getSettings();
  const r = await resellerForTelegram(Number(user.telegram_id));
  if (!r) return { text: "No API account yet.", kb: [[apiBtn(s, "panel", "Reseller API", "api")]] as Button[][] };
  const { data: prods } = await db
    .from("products")
    .select("id,name,price,supplier_stock,supplier_id,delivery_type")
    .eq("is_active", true)
    .is("owner_reseller_id", null)
    .order("sort_order")
    .limit(20);
  const discount = Number(r.discount_percent ?? 0);
  const lines = (prods ?? []).map((p: any) => {
    const yours = Math.max(0, Math.round(Number(p.price) * (1 - discount / 100) * 100) / 100);
    return `• <b>${escapeHtml(p.name)}</b>\n   retail ${money(p.price)} → <b>you pay ${money(yours)}</b>`;
  });
  return {
    text:
      `${apiIcon(s, "prices")} <b>M Y   P R I C E S</b>\n──────────────\n` +
      (discount > 0 ? `Your discount: <b>${discount}%</b> off retail\n\n` : `Custom pricing applies.\n\n`) +
      (lines.length ? lines.join("\n") : "No products available right now.") +
      `\n\n<i>Live prices and full catalogue come from the API.</i>`,
    kb: [[apiBtn(s, "panel", "Reseller API", "api")], [uiBtn(s, "com_home", "home")]] as Button[][],
  };
}

async function apiOrdersView(user: any) {
  const s = await getSettings();
  const r = await resellerForTelegram(Number(user.telegram_id));
  if (!r) return { text: "No API account yet.", kb: [[apiBtn(s, "panel", "Reseller API", "api")]] as Button[][] };
  const { data: orders } = await db
    .from("orders")
    .select("order_no,product_name,quantity,total,status,created_at")
    .eq("reseller_id", r.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const lines = (orders ?? []).map(
    (o: any) =>
      `• <code>#${o.order_no}</code> ${escapeHtml(o.product_name)} ×${o.quantity}\n   ${money(o.total)} · ${escapeHtml(String(o.status))} · ${fmtDate(o.created_at)}`,
  );
  return {
    text:
      `${apiIcon(s, "orders")} <b>A P I   O R D E R S</b>\n──────────────\n` +
      (lines.length ? lines.join("\n") : "No API orders yet."),
    kb: [[apiBtn(s, "panel", "Reseller API", "api")], [uiBtn(s, "com_home", "home")]] as Button[][],
  };
}

/** Warn the reseller in Telegram when their API balance drops below their limit. */
export async function checkResellerLowBalance(resellerId: string) {
  const { data: r } = await db
    .from("resellers")
    .select("id,name,balance,low_bal_alert,telegram_id")
    .eq("id", resellerId)
    .maybeSingle();
  if (!r?.telegram_id) return;
  const limit = Number(r.low_bal_alert ?? 0);
  if (!(limit > 0) || Number(r.balance ?? 0) > limit) return;
  const s = await getSettings();
  await sendMessage(
    Number(r.telegram_id),
    `${apiIcon(s, "alert")} <b>Low API balance</b>\n\nYour API balance is <b>${money(r.balance)}</b> — below your ${money(limit)} alert.\nTop up to keep orders flowing.`,
    [[apiBtn(s, "topup", "Top Up API Balance", "api:topup")]],
  );
}

/** Reseller API panel callbacks (`api`, `api:*`). Returns true when handled. */
export async function handleApiCallback(
  chatId: number,
  data: string,
  user: any,
  edit: (text: string, kb?: Button[][]) => Promise<void>,
): Promise<boolean> {
  if (data !== "api" && !data.startsWith("api:")) return false;
  const s = await getSettings();
  const back: Button[][] = [[apiBtn(s, "panel", "Reseller API", "api")]];
  const action = data === "api" ? "" : data.slice(4);

  if (action === "new") {
    try {
      await createBotReseller(user);
    } catch (e) {
      await edit(`❌ ${escapeHtml(e instanceof Error ? e.message : "Could not create the account")}`, back);
      return true;
    }
  }

  if (action === "key") {
    const r = await resellerForTelegram(chatId);
    if (r) {
      await edit(
        `${apiIcon(s, "key")} <b>Your API key</b>\n\n<code>${escapeHtml(r.api_key)}</code>\n\n<i>Keep it secret. Tap to copy.</i>`,
        back,
      );
      return true;
    }
  }

  if (action === "regen") {
    const r = await resellerForTelegram(chatId);
    if (r) {
      const key = newApiKey();
      await db.from("resellers").update({ api_key: key }).eq("id", r.id);
      await edit(
        `${apiIcon(s, "regen")} <b>New API key generated</b>\n\n<code>${escapeHtml(key)}</code>\n\n⚠️ The old key stopped working right now.`,
        back,
      );
      return true;
    }
  }

  if (action === "revoke") {
    const r = await resellerForTelegram(chatId);
    if (r) await db.from("resellers").update({ is_active: !r.is_active }).eq("id", r.id);
  }

  if (action === "topup") {
    const r = await resellerForTelegram(chatId);
    if (!r) {
      await edit("Open your API account first.", back);
      return true;
    }
    await setState(chatId, { ...(user.state ?? {}), awaiting: "api_topup" });
    await edit(
      `${apiIcon(s, "topup")} <b>Top up API balance</b>\n\nBot wallet: <b>${money(user.balance)}</b>\nAPI balance: <b>${money(r.balance)}</b>\n\nReply with the amount in USD to move, e.g. <code>5</code>.`,
      back,
    );
    return true;
  }

  if (action === "alert") {
    await setState(chatId, { ...(user.state ?? {}), awaiting: "api_alert" });
    await edit(
      `${apiIcon(s, "alert")} <b>Low balance alert</b>\n\nReply with the amount that should trigger the alert, e.g. <code>2</code>.\nSend <code>0</code> to switch it off.`,
      back,
    );
    return true;
  }

  if (action === "prices") {
    const v = await apiPricesView(user);
    await edit(v.text, v.kb);
    return true;
  }

  if (action === "orders") {
    const v = await apiOrdersView(user);
    await edit(v.text, v.kb);
    return true;
  }

  const fresh = (await getUser(chatId)) ?? user;
  const view = await apiPanelView(fresh);
  await edit(view.text, view.kb);
  return true;
}

/** Text replies for the API panel prompts. Returns true when handled. */
export async function handleApiState(
  chatId: number,
  awaiting: string,
  text: string,
  state: any,
): Promise<boolean> {
  const s = await getSettings();
  const back: Button[][] = [[apiBtn(s, "panel", "Reseller API", "api")]];

  if (awaiting === "api_topup") {
    state.awaiting = null;
    await setState(chatId, state);
    const fresh = await getUser(chatId);
    const amount = Number(text.replace(/[^0-9.]/g, ""));
    const r = await apiTopupFromWallet(fresh, amount);
    if ("error" in r && r.error) {
      await say(chatId, `❌ ${escapeHtml(r.error)}`, back);
      return true;
    }
    const after = await getUser(chatId);
    const view = await apiPanelView(after);
    await say(chatId, `✅ ${money(amount)} moved to your API balance.\n\n${view.text}`, view.kb);
    return true;
  }

  if (awaiting === "api_alert") {
    state.awaiting = null;
    await setState(chatId, state);
    const limit = Math.max(0, Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100) / 100 || 0);
    const r = await resellerForTelegram(chatId);
    if (r) await db.from("resellers").update({ low_bal_alert: limit }).eq("id", r.id);
    const fresh = await getUser(chatId);
    const view = await apiPanelView(fresh);
    await say(
      chatId,
      `${limit > 0 ? `✅ Alert set at ${money(limit)}.` : "✅ Low balance alert switched off."}\n\n${view.text}`,
      view.kb,
    );
    return true;
  }

  return false;
}

/** Admin view: pick an API panel icon to replace. */
async function admApiIconView() {
  const settings = await getSettings();
  const kb: Button[][] = (Object.keys(API_ICONS) as ApiIconKey[]).map((key) => {
    const parsed = parseIconValue(settings[`api_icon_${key}`] ?? "", API_ICONS[key][0]);
    return [
      {
        text: `${parsed.customId ? "✨" : parsed.glyph} ${API_ICONS[key][1]}`.trim(),
        callback_data: `adm:qi:${key}`,
        ...(parsed.customId ? { icon_custom_emoji_id: parsed.customId } : {}),
      },
    ];
  });
  kb.push(ADM_BACK[0]!);
  const list = iconPreviewLines(
    settings,
    "api_icon_",
    (Object.keys(API_ICONS) as ApiIconKey[]).map((k) => [k, API_ICONS[k][1], API_ICONS[k][0]]),
  );
  return {
    text:
      "🔌 <b>API icons</b>\n\nThese icons are used on the in-bot Reseller API panel " +
      "(account, balance, key, orders, buttons…).\n" +
      "Pick one, then send a normal emoji or a <b>Telegram Premium custom emoji</b>. Send <code>-</code> to reset.\n\n" +
      `<b>Current icons</b>\n${list}`,
    kb,
  };
}


/** Admin callbacks for API icons. Returns true when handled. */
export async function handleApiIconCallback(
  chatId: number,
  data: string,
  state: any,
  edit: (text: string, kb?: Button[][]) => Promise<void>,
): Promise<boolean> {
  if (data === "adm:apiicons") {
    if (!(await isAdmin(chatId))) return true;
    const v = await admApiIconView();
    await edit(v.text, v.kb);
    return true;
  }
  if (data.startsWith("adm:qi:")) {
    if (!(await isAdmin(chatId))) return true;
    const key = data.slice(7) as ApiIconKey;
    if (!(key in API_ICONS)) return true;
    await setState(chatId, { ...(state ?? {}), awaiting: "adm_api_icon", adm_api_icon: key });
    await edit(
      `🔌 Send the new icon for <b>${API_ICONS[key][1]}</b>.\n\nNormal emoji or Telegram Premium custom emoji both work. Send <code>-</code> to reset.`,
      [[{ text: "⬅️ API icons", callback_data: "adm:apiicons" }], ADM_BACK[0]!],
    );
    return true;
  }
  return false;
}

/** Admin text reply that carries a new API icon. Returns true when handled. */
export async function handleApiIconState(chatId: number, msg: any, text: string, state: any): Promise<boolean> {
  if (state?.awaiting !== "adm_api_icon") return false;
  state.awaiting = null;
  const key = String(state.adm_api_icon ?? "") as ApiIconKey;
  await setState(chatId, state);
  if (!(await isAdmin(chatId)) || !(key in API_ICONS)) return true;
  const input = readIconInput(msg, text, API_ICONS[key][0]);
  if (input.empty) {
    await say(chatId, ICON_INPUT_HELP, ADM_BACK);
    return true;
  }
  try {
    await saveIconSetting(`api_icon_${key}`, input.value);
  } catch (e) {
    await say(chatId, saveFailText(e), ADM_BACK);
    return true;
  }
  const v = await admApiIconView();
  await say(
    chatId,
    `✅ ${API_ICONS[key][1]} updated → ${iconPreviewHtml(input.value, API_ICONS[key][0])}\n\n${v.text}`,
    v.kb,
  );

  await premiumEmojiNote(chatId, input.value);
  return true;
}
