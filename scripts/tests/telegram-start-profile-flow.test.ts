import { expect, mock, test } from "bun:test";

const settings: Record<string, string> = { admin_telegram_ids: "123", binance_status: "inactive" };
const user: any = { telegram_id: 123, first_name: "Test", state: { co: { items: [{ product_id: "p1", qty: 1 }] } }, username: "tester", ref_code: "TESTREF", referral_count: 3, referral_earnings: 1.25, created_at: "2026-11-01T00:00:00Z", balance: 12.50, total_spent: 15 };
let buttons: any[][] = [];
let rendered = "";
let reads: string[] = [];
let enabled = true;
const legacy = "5400280896311944999";
mock.module("@/lib/bybit.server", () => ({ bybitSettings: async () => ({ bybit_enabled: enabled ? "1" : "0", bybit_api_verified: "1", bybit_uid: "98765", bybit_icon: legacy }), findBybitPayment: async () => { throw new Error("Unexpected payment verification"); } }));
mock.module("@/lib/blockchain.server", () => ({ blockchainGateways: async () => ["trc20", "bep20"].map((network) => ({ network, enabled, verified: true })), findChainPayment: async () => { throw new Error("Unexpected payment verification"); } }));
mock.module("@/lib/bulk-discount.server", () => ({ bulkTiersFor: async () => ({}), bulkUnit: (_p: unknown, price: number) => price }));
mock.module("@/lib/bot/contact.server", () => ({ recordContact: async () => {} }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    reads.push(table);
    let key = "";
    const result = () => ({ data: table === "bot_settings" ? (key ? { value: settings[key] } : Object.entries(settings).map(([key, value]) => ({ key, value }))) : table === "bot_users" ? user : table === "products" ? [{ id: "p1", name: "Test product", is_active: true, delivery_type: "manual", price: 2 }] : [], error: null, count: table === "orders" ? 7 : null });
    const chain: any = {
      select: () => chain, order: () => chain, range: () => chain, in: () => chain, neq: () => chain, limit: () => chain, gte: () => chain, lt: () => chain, or: () => chain,
      eq: (field: string, value: string) => { if (field === "key") key = value; return chain; },
      update: (value: any) => { if (table === "bot_users" && value.state) user.state = value.state; return chain; },
      upsert: (value: any) => { if (table === "bot_settings") settings[value.key] = value.value; return chain; },
      maybeSingle: async () => result(), single: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
  rpc: async () => ({ data: null, error: null }),
} }));
const show = async (_chat: number, _text: string, kb: any[][] = []) => { buttons = kb; rendered = _text; return { ok: true, result: { message_id: 1 } }; };
mock.module("@/lib/telegram.server", () => ({
  answerCallback: async () => ({ ok: true }), sendMessage: show,
  editMessage: async (chat: number, _id: number, text: string, kb: any[][]) => show(chat, text, kb),
  styled: (button: object, style: string) => ({ ...button, style }), styleRows: (rows: any) => rows,
  deleteMessage: async () => ({}), getMe: async () => ({}), tg: async () => ({}), isCustomEmojiBlocked: () => false,
  sendDocument: async () => ({}), sendDocumentUpload: async () => ({}), sendAlertMessage: async () => ({}), sendPhoto: async () => ({}), sendAnimation: async () => ({}), COMMAND_LIST: [],
}));
mock.module("@/lib/bg.server", () => ({ backgroundWaitUntil: () => true }));
const { handleUpdate } = await import("../../src/lib/bot/engine.server");
async function click(data: string, id = 123) {
  await handleUpdate({ callback_query: { id: "test", data, from: { id, first_name: "Test" }, message: { message_id: 1, chat: { id, type: "private" } } } });
}
async function reply(text: string, emojiId?: string) {
  await handleUpdate({ message: { message_id: 2, text, entities: emojiId ? [{ type: "custom_emoji", offset: 0, length: text.length, custom_emoji_id: emojiId }] : [], from: { id: 123, first_name: "Test" }, chat: { id: 123, type: "private" } } });
}

// All networking and writes are mocked: no live messages, orders or settings.
test("start and return-home never read order details or include private referral controls", async () => {
  reads = [];
  await reply("/start");
  expect(reads.filter(t => t === "orders")).toHaveLength(0);
  expect(buttons.flat().some(b => b.copy_text)).toBe(false);
  expect(rendered.includes(user.ref_code)).toBe(false);
  await click("home");
  expect(reads.filter(t => t === "orders")).toHaveLength(0);
  expect(buttons.flat().some(b => b.copy_text)).toBe(false);
});

test("profile loads the customer's order aggregate and copies their exact referral link", async () => {
  reads = [];
  await click("profile");
  expect(reads.filter(t => t === "orders")).toHaveLength(1);
  const copy = buttons.flat().find(b => b.copy_text);
  expect(copy?.copy_text.text).toBe("https://t.me/your_bot?start=ref_TESTREF");
  expect(copy?.callback_data).toBeUndefined();
  expect(buttons.flat().some(b => b.callback_data === "orders")).toBe(true);
});

test("bot admin menu Premium icon save is reused by the actual start menu", async () => {
  await click("adm:mi:shop");
  await reply("⭐", "5400280896311944960");
  expect(settings.menu_icon_shop).toBe("5400280896311944960|⭐");
  await click("home");
  expect(buttons.flat().find(b => b.callback_data === "shop:0")?.icon_custom_emoji_id).toBe("5400280896311944960");
});

for (const slot of ["home_greet", "home_description", "home_choose", "home_community", "home_group", "home_channel", "home_updates"]) {
  test(`${slot}: bot-admin Premium icon persists and reset removes the override`, async () => {
    await click(`adm:uii:${slot}`);
    await reply("⭐", "5400280896311944961");
    expect(settings[`ui_icon_${slot}`]).toBe("5400280896311944961|⭐");
    await click(`adm:uii:${slot}`);
    await reply("-");
    expect(settings[`ui_icon_${slot}`]).toBe("");
  });
}
