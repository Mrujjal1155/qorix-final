import { expect, mock, test } from "bun:test";
import { WEBSITE_PREMIUM_ICONS, websiteIconMedia } from "../../src/lib/website-premium-icons";
const settings: Record<string, string> = { admin_telegram_ids: "123", menu_icon_back: "5215361191051798408", stars_enabled: "off" };
const user: { telegram_id: number; state: Record<string, unknown>; balance: number; total_spent: number } = { telegram_id: 123, state: {}, balance: 0, total_spent: 0 };
let buttons: { text: string; callback_data?: string }[][] = [];
let prepared = 0;
let failure = false;
mock.module("@/lib/website-premium-icons.server", () => ({ prepareWebsiteIconRows: async (values: Record<string, string>) => {
  prepared++;
  if (failure) throw new Error("download failed");
  return Object.entries(values).map(([key, emojiId]) => ({ key, value: emojiId ? JSON.stringify({ emojiId, kind: "image", url: `https://zohumyfxfhyzwjzxjdzi.supabase.co/storage/v1/object/public/public-images/website-premium/${emojiId}.webp` }) : "" }));
} }));
mock.module("@/lib/bot/contact.server", () => ({ recordContact: async () => {} }));
mock.module("@/lib/bg.server", () => ({ backgroundWaitUntil: () => true }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    let key = "";
    const result = () => ({ data: table === "bot_settings" ? (key ? { value: settings[key] } : Object.entries(settings).map(([key, value]) => ({ key, value }))) : table === "bot_users" ? user : [], error: null });
    const chain: any = {
      select: () => chain, order: () => chain, range: () => chain, limit: () => chain,
      gt: () => chain, gte: () => chain, lt: () => chain, in: () => chain, or: () => chain, neq: () => chain, not: () => chain,
      eq: (field: string, value: string) => { if (field === "key") key = value; return chain; },
      update: (value: { state?: Record<string, unknown> }) => { if (table === "bot_users" && value.state) user.state = value.state; return chain; },
      upsert: (rows: { key: string; value: string } | { key: string; value: string }[]) => { if (table === "bot_settings") for (const row of Array.isArray(rows) ? rows : [rows]) settings[row.key] = row.value; return chain; },
      maybeSingle: async () => result(), single: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  }, rpc: async () => ({ data: null, error: null }),
} }));
const show = async (_chat: number, _text: string, kb: typeof buttons = []) => { buttons = kb; return { ok: true, result: { message_id: 1 } }; };
mock.module("@/lib/telegram.server", () => ({ answerCallback: async () => ({ ok: true }), sendMessage: show,
  editMessage: async (chat: number, _id: number, text: string, kb: typeof buttons) => show(chat, text, kb),
  styled: (button: object, style: string) => ({ ...button, style }), styleRows: (rows: unknown) => rows,
  deleteMessage: async () => ({}), getMe: async () => ({}), tg: async () => ({}), isCustomEmojiBlocked: () => false,
  sendDocument: async () => ({}), sendDocumentUpload: async () => ({}), sendAlertMessage: async () => ({}), sendPhoto: async () => ({}), sendAnimation: async () => ({}), COMMAND_LIST: [],
}));
const { handleUpdate, adminKeyboard } = await import("../../src/lib/bot/engine.server");
async function click(data: string, sender = 123) { await handleUpdate({ callback_query: { id: "test", data, from: { id: sender, first_name: "Test" }, message: { message_id: 1, chat: { id: sender, type: "private" } } } }); }
async function reply(text: string, emojiId?: string) { await handleUpdate({ message: { message_id: 2, text, entities: emojiId ? [{ type: "custom_emoji", offset: 0, length: text.length, custom_emoji_id: emojiId }] : [], from: { id: 123, first_name: "Test" }, chat: { id: 123, type: "private" } } }); }
test("Bot Admin lists five website-only controls within Telegram keyboard limits", async () => {
  expect(adminKeyboard().flat().some(button => button.callback_data === "adm:webicons")).toBe(true);
  await click("adm:webicons");
  for (const icon of WEBSITE_PREMIUM_ICONS) expect(buttons.flat().some(button => button.callback_data === `adm:wii:${icon.key}`)).toBe(true);
  expect(buttons.flat().length).toBeLessThanOrEqual(100);
  for (const row of buttons) { expect(row.length).toBeLessThanOrEqual(8); for (const button of row) expect(new TextEncoder().encode(button.callback_data ?? "").length).toBeLessThanOrEqual(64); }
});
test("admin Premium entity and numeric ID save artwork; reset restores default without changing bot/payment", async () => {
  for (const icon of WEBSITE_PREMIUM_ICONS) {
    await click(`adm:wii:${icon.key}`);
    expect(user.state["awaiting"]).toBe("adm_website_icon");
    await reply("🌐", "5400280896311944960");
    expect(websiteIconMedia(settings[icon.key] ?? "")?.emojiId).toBe("5400280896311944960");
    await click(`adm:wii:${icon.key}`); await reply("5400280896311944961");
    expect(websiteIconMedia(settings[icon.key] ?? "")?.emojiId).toBe("5400280896311944961");
    await click(`adm:wii:${icon.key}`); await reply("-"); expect(settings[icon.key]).toBe("");
  }
  expect(settings["menu_icon_back"]).toBe("5215361191051798408");
  expect(settings["stars_enabled"]).toBe("off");
});
test("non-admin or forged slot cannot enter website icon editor", async () => {
  user.state = {};
  const before = prepared;
  await click("adm:wii:site_web_icon_connect_button", 456);
  await click("adm:wii:stars_enabled");
  expect(user.state["awaiting"]).toBeUndefined(); expect(prepared).toBe(before);
});
test("failed media download keeps original icon and permits retry", async () => {
  const key = "site_web_icon_connect_button";
  await click(`adm:wii:${key}`); await reply("5400280896311944960");
  const saved = settings[key];
  await click(`adm:wii:${key}`); failure = true; await reply("5400280896311944961"); failure = false;
  expect(settings[key]).toBe(saved); expect(user.state["awaiting"]).toBe("adm_website_icon");
});