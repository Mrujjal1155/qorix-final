import { expect, mock, test } from "bun:test";

let noProducts = false;
let view: { text: string; kb: Array<Array<{ callback_data?: string; style?: string }>> } | undefined;
const categories = Array.from({ length: 24 }, (_, i) => ({ id: `c${i}`, name: i === 1 ? "Gemini AI" : `Category ${i}`, is_active: true, channel: "both" }));
const products = [
  { id: "ready", name: "Gemini Pro", category_id: "c0", is_active: true, delivery_type: "auto", price: 2, old_price: 3, stock: 3 },
  { id: "out", name: "Canva Pro", category_id: "c0", is_active: true, delivery_type: "auto", price: 1, stock: 0 },
  { id: "off", name: "Disabled", category_id: "c0", is_active: false, delivery_type: "auto", price: 1, stock: 3 },
];
const user = { telegram_id: 123, first_name: "Test", username: "test", last_name: null, state: {} };
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    let activeOnly = false;
    const result = () => ({ data: table === "categories" ? categories : table === "products" ? (noProducts ? [] : products.filter((p) => !activeOnly || p.is_active)) : table === "bot_users" ? user : [], error: null });
    const chain: any = {
      select: () => chain, order: () => chain, range: () => chain, is: () => chain,
      neq: () => chain, gte: () => chain, lt: () => chain, lte: () => chain, limit: () => chain, in: () => chain, or: () => chain,
      eq: (key: string, value: unknown) => { if (key === "is_active" && value === true) activeOnly = true; return chain; },
      update: () => chain, maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
  rpc: () => {
    const chain: any = { order: () => chain, range: () => chain, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: products.map((p) => ({ product_id: p.id, available: p.stock })), error: null }).then(resolve) };
    return chain;
  },
} }));
mock.module("@/lib/telegram.server", () => ({
  answerCallback: async () => ({ ok: true }),
  editMessage: async (_chat: number, _message: number, text: string, kb: Array<Array<{ callback_data?: string; style?: string }>>) => { view = { text, kb }; return { ok: true }; },
  styled: (button: object, style: string) => ({ ...button, style }),
  styleRows: (rows: object[][], style: string) => rows.map((row) => row.map((button) => ({ ...button, style }))),
  sendMessage: async () => { throw new Error("Unexpected Telegram send"); },
  deleteMessage: async () => ({ ok: true }), getMe: async () => ({}), tg: async () => ({}),
  isCustomEmojiBlocked: () => false, sendDocument: async () => ({}), sendDocumentUpload: async () => ({}),
  sendAlertMessage: async () => ({}), sendPhoto: async () => ({}), sendAnimation: async () => ({}), COMMAND_LIST: [],
}));
mock.module("@/lib/bg.server", () => ({ backgroundWaitUntil: () => false }));
const { handleUpdate } = await import("../../src/lib/bot/engine.server");
async function click(data: string) {
  view = undefined;
  await handleUpdate({ callback_query: { id: "test", data, from: { id: 123, first_name: "Test", username: "test" }, message: { message_id: 1, chat: { id: 123, type: "private" } } } });
  if (!view) throw new Error("No bot view rendered");
  return view;
}
test("home → shop navigation keeps the real bot's existing quick actions", async () => {
  const home = await click("home");
  expect(home.kb.flat().some((button) => button.callback_data === "shop:0")).toBe(true);
  expect(home.kb.flat().some((button) => button.callback_data === "wallet")).toBe(true);
  const shop = await click("shop:0");
  expect(shop.kb.flat().filter((button) => button.callback_data?.startsWith("cat:c"))).toHaveLength(24);
});
test("shop → category → All Products respects stock visibility in actual bot callbacks", async () => {
  const shop = await click("shop:0");
  expect(shop.kb.flat().filter((b) => b.callback_data?.startsWith("cat:c"))).toHaveLength(24);
  expect(shop.kb.flat().filter((b) => b.callback_data?.startsWith("p:"))).toEqual([]);
  expect(shop.kb.flat().length).toBeLessThanOrEqual(100);
  const category = await click("cat:c0:0");
  expect(category.kb.flat().filter((b) => b.callback_data?.startsWith("p:")).map((b) => [b.callback_data, b.style])).toEqual([["p:ready", "primary"], ["p:out", "danger"]]);
  const all = await click("cat:all:0");
  expect(all.kb.flat().filter((b) => b.callback_data?.startsWith("p:")).map((b) => b.callback_data)).toEqual(["p:ready"]);
  const hidden = await click("cat:unavailable:0");
  expect(hidden.kb.flat().filter((b) => b.callback_data?.startsWith("p:"))).toEqual([]);
});
test("shop colors: Flash Deals red, top category green, grid categories keep their colour", async () => {
  const shop = await click("shop:0");
  expect(shop.kb.flat().find((b) => b.callback_data === "flash")?.style).toBe("danger");
  expect(shop.kb.flat().find((b) => b.callback_data === "cat:c1:0")?.style).toBe("success");
  expect(shop.kb.flat().find((b) => b.callback_data === "cat:c0:0")?.style).toBe("primary");
});
test("empty shop still renders all 24 categories", async () => {
  noProducts = true;
  const originalNow = Date.now;
  Date.now = () => originalNow() + 20_000;
  try {
    const shop = await click("shop:0");
    expect(shop.kb.flat().filter((b) => b.callback_data?.startsWith("cat:c"))).toHaveLength(24);
    expect(shop.kb.flat().filter((b) => b.callback_data?.startsWith("p:"))).toEqual([]);
  } finally { Date.now = originalNow; noProducts = false; }
});