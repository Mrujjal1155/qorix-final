import { expect, mock, test } from "bun:test";

let noProducts = false;
let design = "classic";
let view: { text: string; kb: Array<Array<{ callback_data?: string; style?: string }>> } | undefined;
const categories = Array.from({ length: 24 }, (_, i) => ({ id: `c${i}`, name: i === 1 ? "Gemini AI" : `Category ${i}`, is_active: true, channel: "both" }));
const products = [
  { id: "out", name: "Canva Pro", category_id: "c0", is_active: true, delivery_type: "auto", price: 1, stock: 0 },
  { id: "ready", name: "Gemini Pro", category_id: "c0", is_active: true, delivery_type: "auto", price: 2, old_price: 3, stock: 3 },
  { id: "off", name: "Disabled", category_id: "c0", is_active: false, delivery_type: "auto", price: 1, stock: 3 },
];
const user = { telegram_id: 123, first_name: "Test", username: "test", last_name: null, state: {} };
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    let activeOnly = false;
    const settings = [{ key: "telegram_shop_design", value: design }, { key: "category_banner_c0", value: "https://example.com/plans.png" }, { key: "btn_color_flash", value: "danger" }];
    const result = () => ({ data: table === "bot_settings" ? settings : table === "categories" ? categories : table === "products" ? (noProducts ? [] : products.filter((p) => !activeOnly || p.is_active)) : table === "bot_users" ? user : [], error: null });
    const chain: any = {
      select: () => chain, order: () => chain, range: () => chain, is: () => chain,
      neq: () => chain, gt: () => chain, gte: () => chain, lt: () => chain, lte: () => chain, limit: () => chain, in: () => chain, or: () => chain,
      eq: (key: string, value: unknown) => { if (key === "is_active" && value === true) activeOnly = true; return chain; },
      update: () => chain, maybeSingle: async () => table === "bot_settings" ? { data: { value: design }, error: null } : result(),
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
test("shop colors and ordering: stocked categories first, empty categories red and last", async () => {
  const shop = await click("shop:0");
  expect(shop.kb.flat().find((b) => b.callback_data === "flash")?.style).toBe("danger");
  const categoryButtons = shop.kb.flat().filter((b) => b.callback_data?.startsWith("cat:c"));
  expect(categoryButtons[0]?.callback_data).toBe("cat:c0:0");
  expect(categoryButtons[0]?.style).toBe("primary");
  expect(shop.kb.flat().find((b) => b.callback_data === "cat:c1:0")?.style).toBe("danger");
  expect(categoryButtons.slice(1).every((b) => b.style === "danger")).toBe(true);
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
test("admin switch changes the real Shop callback and can return to Classic", async () => {
  design = "simple";
  const originalNow = Date.now;
  Date.now = () => originalNow() + 40_000;
  try {
  const simple = await click("shop:0");
  const simpleCategories = simple.kb.flat().filter(b => b.callback_data?.startsWith("cat:c"));
  expect(simpleCategories[0]?.callback_data).toBe("cat:c0:0");
  expect(simpleCategories[0]?.style).toBe("primary");
  expect(simpleCategories.slice(1).every(b => b.style === "danger")).toBe(true);
  const plans = await click("cat:c0:0");
  expect(plans.kb.flat().filter(b => b.callback_data?.startsWith("p:")).map(b => [b.callback_data, b.style])).toEqual([["p:ready", "success"], ["p:out", "danger"]]);
  expect(plans.kb.flat().some(b => b.callback_data === "shop:0")).toBe(true);
  expect(plans.kb.flat().length).toBeLessThanOrEqual(100);
  expect(plans.kb.flat().every(b => !b.callback_data || new TextEncoder().encode(b.callback_data).length <= 64)).toBe(true);
  design = "classic";
  const classic = await click("shop:0");
  expect(classic.kb.flat().filter(b => b.callback_data?.startsWith("cat:c"))).toHaveLength(24);
  const oldPlans = await click("cat:c0:0");
  expect(oldPlans.kb.flat().find(b => b.callback_data === "p:ready")?.style).toBe("primary");
  } finally { design = "classic"; Date.now = originalNow; }
});
test("a single-plan category goes directly to its product in Simple Shop", async () => {
  design = "simple";
  products.push({ id: "single", name: "Single plan", category_id: "c2", is_active: true, delivery_type: "auto", price: 4, stock: 7 });
  const originalNow = Date.now;
  Date.now = () => originalNow() + 60_000;
  try {
    const shop = await click("shop:0");
    expect(shop.kb.flat().find(b => b.callback_data === "p:single")?.style).toBe("success");
    expect(shop.kb.flat().some(b => b.callback_data === "cat:c2:0")).toBe(false);
  } finally { design = "classic"; Date.now = originalNow; products.pop(); }
});