import { expect, mock, test } from "bun:test";

const settings: Record<string, string> = { admin_telegram_ids: "123", binance_status: "inactive" };
const user: any = { telegram_id: 123, first_name: "Test", state: { co: { items: [{ product_id: "p1", qty: 1 }] } }, balance: 0, total_spent: 0 };
let buttons: any[][] = [];
let enabled = true;
const legacy = "5400280896311944999";
mock.module("@/lib/bybit.server", () => ({ bybitSettings: async () => ({ bybit_enabled: enabled ? "1" : "0", bybit_api_verified: "1", bybit_uid: "98765", bybit_icon: legacy }), findBybitPayment: async () => { throw new Error("Unexpected payment verification"); } }));
mock.module("@/lib/blockchain.server", () => ({ blockchainGateways: async () => ["trc20", "bep20"].map((network) => ({ network, enabled, verified: true })), findChainPayment: async () => { throw new Error("Unexpected payment verification"); } }));
mock.module("@/lib/bulk-discount.server", () => ({ bulkTiersFor: async () => ({}), bulkUnit: (_p: unknown, price: number) => price }));
mock.module("@/lib/bot/contact.server", () => ({ recordContact: async () => {} }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    let key = "";
    const result = () => ({ data: table === "bot_settings" ? (key ? { value: settings[key] } : Object.entries(settings).map(([key, value]) => ({ key, value }))) : table === "bot_users" ? user : table === "products" ? [{ id: "p1", name: "Test product", is_active: true, delivery_type: "manual", price: 2 }] : [], error: null });
    const chain: any = {
      select: () => chain, order: () => chain, range: () => chain, in: () => chain, neq: () => chain, limit: () => chain,
      eq: (field: string, value: string) => { if (field === "key") key = value; return chain; },
      update: (value: any) => { if (table === "bot_users" && value.state) user.state = value.state; return chain; },
      upsert: (value: any) => { if (table === "bot_settings") settings[value.key] = value.value; return chain; },
      maybeSingle: async () => result(), single: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
  rpc: async () => ({ data: null, error: null }),
} }));
const show = async (_chat: number, _text: string, kb: any[][] = []) => { buttons = kb; return { ok: true, result: { message_id: 1 } }; };
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
const slots = [
  ["wal_bybit", "bybit", "5400280896311944960"],
  ["wal_chain_bep20", "chain_bep20", "5400280896311944961"],
  ["wal_chain_trc20", "chain_trc20", "5400280896311944962"],
] as const;

test("legacy Bybit icon is preserved before bot override", async () => {
  await click("wallet");
  expect(buttons.flat().find((b) => b.callback_data === "dep:bybit")?.icon_custom_emoji_id).toBe(legacy);
});

for (const [slot, gateway, emojiId] of slots) {
  test(`${gateway}: admin edit → Premium entity save → wallet and checkout readback → reset`, async () => {
    await click("adm:paymenticons");
    expect(buttons.flat().some((b) => b.callback_data === `adm:uii:${slot}`)).toBe(true);
    await click(`adm:uii:${slot}`);
    expect(user.state.awaiting).toBe("adm_ui_icon");
    await reply("⭐", emojiId);
    expect(settings[`ui_icon_${slot}`]).toBe(`${emojiId}|⭐`);
    for (const [page, prefix] of [["wallet", "dep"], ["copay", "copm"]]) {
      await click(page ?? "");
      const button = buttons.flat().find((b) => b.callback_data === `${prefix}:${gateway}`);
      expect(button?.icon_custom_emoji_id).toBe(emojiId);
      expect(button?.style).toBe("primary");
      expect(new TextEncoder().encode(button.callback_data).length).toBeLessThanOrEqual(64);
    }
    await click(`adm:uii:${slot}`);
    await reply("-");
    expect(settings[`ui_icon_${slot}`]).toBe("");
    await click("wallet");
    expect(buttons.flat().find((b) => b.callback_data === `dep:${gateway}`)?.icon_custom_emoji_id).toBeUndefined();
  });
}

test("icons never enable disabled payment gateways", async () => {
  enabled = false;
  for (const [slot, , emojiId] of slots) settings[`ui_icon_${slot}`] = emojiId;
  for (const page of ["wallet", "copay"]) {
    await click(page);
    expect(buttons.flat().filter((b) => /^(dep|copm):(bybit|chain_)/.test(b.callback_data ?? ""))).toHaveLength(0);
  }
});

test("non-admin cannot enter the icon editor", async () => {
  await click("adm:uii:wal_bybit", 456);
  expect(user.state.awaiting).not.toBe("adm_ui_icon");
});