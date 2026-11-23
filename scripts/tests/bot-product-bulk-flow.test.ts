import { afterAll, expect, mock, test } from "bun:test";

const product = {
  id: "linkedin", name: "LinkedIn Premium Career — 3 Months (Link)", price: 0.35,
  is_active: true, delivery_type: "auto", bot_media_url: null as string | null,
  description: "Premium Career access\nAccount activation details",
  quick_guide: "1. Open your activation link\n2. Follow the setup steps",
  important_note: "Use your own account\nKeep your activation details safe",
  delivery_time: "3 months", details: [{ label: "Type", value: "Activation link" }],
};
const tiers = [{ min_qty: 5, type: "flat", value: 0.05 }, { min_qty: 10, type: "flat", value: 0.1 }, { min_qty: 15, type: "flat", value: 0.15 }];
const user = { telegram_id: 123, first_name: "Test", state: {}, total_spent: 0 };
mock.module("@/lib/bot/contact.server", () => ({ recordContact: async () => {} }));
mock.module("@/lib/bg.server", () => ({ backgroundWaitUntil: () => true }));
mock.module("@/lib/telegram-website-login.server", () => ({ issueTelegramWebsiteLogin: async () => "https://qorixlab.com/tg?code=test" }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const result = () => ({ data: table === "products" ? product : table === "bot_users" ? user : table === "bulk_discounts" ? [{ product_ids: [product.id], channel: "both", tiers }] : [], count: 48, error: null });
    const chain: any = {
      select: () => chain, order: () => chain, range: () => chain, limit: () => chain,
      eq: () => chain, in: () => chain, overlaps: () => chain, update: () => chain,
      gt: () => chain, gte: () => chain, lt: () => chain, lte: () => chain, not: () => chain,
      or: () => chain, neq: () => chain, is: () => chain,
      maybeSingle: async () => result(), single: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  }, rpc: async () => ({ data: null, error: null }),
} }));

const originalFetch = globalThis.fetch;
const originalToken = process.env["TELEGRAM_BOT_TOKEN"];
process.env["TELEGRAM_BOT_TOKEN"] = "mock-token-no-real-network";
let calls: Array<{ method: string; body: Record<string, any> }> = [];
globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
  calls.push({ method: String(url).split("/").pop() ?? "", body: JSON.parse(String(init?.body)) });
  return Response.json({ ok: true, result: { message_id: 7 } });
}) as unknown as typeof fetch;
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env["TELEGRAM_BOT_TOKEN"];
  else process.env["TELEGRAM_BOT_TOKEN"] = originalToken;
});
const { handleUpdate } = await import("../../src/lib/bot/engine.server");
async function openProduct() {
  calls = [];
  await handleUpdate({ callback_query: { id: "test", data: `p:${product.id}`, from: { id: 123, first_name: "Test" }, message: { message_id: 1, chat: { id: 123, type: "private" } } } });
  const rendered = calls.find(call => call.body["rich_message"]);
  if (!rendered) throw new Error("Product callback did not produce rich content");
  const html: string = rendered.body["rich_message"].html;
  const prices = Array.from(html.matchAll(/<td>(\d+)\+ pcs<\/td><td[^>]*>\$(\d+\.\d+)<\/td>/g), row => [Number(row[1]), Number(row[2])]);
  return { rendered, prices };
}

test("real product open/refresh callback reads saved tiers and returns the matching per-piece prices", async () => {
  const { rendered, prices } = await openProduct();
  expect(prices).toEqual([[5, 0.3], [10, 0.25], [15, 0.2]]);
  expect(rendered.body["chat_id"]).toBe(123);
  const actions = rendered.body["reply_markup"].inline_keyboard.flat().map((button: Record<string, unknown>) => button["callback_data"]);
  expect(actions).toContain("qty:linkedin");
  expect(actions).toContain("cadd:linkedin:1");
});

test("product banner keeps discount details in the rich message rather than an unsupported media caption", async () => {
  product.bot_media_url = "https://example.com/product.mp4";
  const { rendered, prices } = await openProduct();
  expect(prices).toEqual([[5, 0.3], [10, 0.25], [15, 0.2]]);
  expect(rendered.method).toBe("sendRichMessage");
  const banner = calls.find(call => call.method === "sendAnimation");
  expect(banner?.body["caption"]).toBeUndefined();
});