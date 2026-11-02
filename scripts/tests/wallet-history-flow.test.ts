import { beforeEach, expect, mock, test } from "bun:test";
import { homeMessageFallback } from "../../src/lib/bot/home-message";

const user = { telegram_id: 123, first_name: "Customer", state: {}, balance: 42, total_spent: 10 };
const reads: Array<{ table: string; owner?: number }> = [];
let output = "";
let buttons: any[][] = [];
const ledger = Array.from({ length: 6 }, (_, i) => ({ id: String(i), telegram_id: 123, amount: i === 0 ? 10 : -1, type: i === 0 ? "deposit" : "purchase", method: i === 0 ? "bybit" : "wallet", status: "completed", created_at: "2026-11-02T09:00:00Z" }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    const read = { table, owner: undefined as number | undefined }; reads.push(read);
    let start = 0, end = Infinity, historyRead = false;
    const result = () => ({ data: table === "bot_users" ? user : table === "transactions" ? ledger.slice(start, end) : table === "binance_deposits" && historyRead ? [{ id: "p1", amount_usdt: 10, kind: "bybit", status: "pending", created_at: "2026-11-02T09:00:00Z", checkout_item: null }] : [], error: null });
    const chain: any = {
      select: (fields: string) => { historyRead = fields.includes("checkout_item:"); return chain; }, eq: (key: string, value: number) => { if (key === "telegram_id") read.owner = value; return chain; },
      neq: () => chain, gte: () => chain, gt: () => chain, lt: () => chain, in: () => chain, not: () => chain,
      order: () => chain, insert: () => chain, update: () => chain,
      range: (a: number, b: number) => { start = a; end = b + 1; return chain; }, limit: (n: number) => { end = n; return chain; },
      maybeSingle: async () => result(), single: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve),
    }; return chain;
  }, rpc: async () => ({ data: null, error: null }),
} }));
const show = async (_chat: number, text: string, kb: any[][] = []) => { output = text; buttons = kb; return { ok: true, result: { message_id: 1 } }; };
mock.module("@/lib/telegram.server", () => ({
  answerCallback: async () => ({ ok: true }), sendMessage: show,
  editMessage: async (chat: number, _id: number, text: string, kb: any[][]) => show(chat, text, kb),
  styled: (button: object, style: string) => ({ ...button, style }), styleRows: (rows: any) => rows,
  deleteMessage: async () => ({}), getMe: async () => ({}), tg: async () => ({}), isCustomEmojiBlocked: () => false,
  sendDocument: async () => ({}), sendDocumentUpload: async () => ({}), sendAlertMessage: async () => ({}), sendPhoto: async () => ({}), sendAnimation: async () => ({}), COMMAND_LIST: [],
}));
mock.module("@/lib/bg.server", () => ({ backgroundWaitUntil: () => true }));
const { handleUpdate } = await import("../../src/lib/bot/engine.server");
async function click(data: string, chat = { id: 123, type: "private" }) {
  await handleUpdate({ callback_query: { id: "test", data, from: { id: 123, first_name: "Customer" }, message: { message_id: 1, chat } } });
}
beforeEach(() => { reads.length = 0; output = ""; buttons = []; });
test("wallet history → next → payment attempts → refresh preserves wallet", async () => {
  await click("hist:0");
  expect(reads.find((r) => r.table === "transactions")?.owner).toBe(123);
  const next = buttons.flat().find((b) => b.callback_data === "hist:1"); expect(next).toBeDefined();
  await click(next.callback_data);
  expect(buttons.flat().some((b) => b.callback_data === "hist:2")).toBe(false);
  await click("histpay:0");
  const text = homeMessageFallback(output);
  expect(text).toContain("Bybit Pay"); expect(text).toContain("Pending"); expect(text).not.toContain("Completed");
  const refresh = buttons.flat().find((b) => b.callback_data === "histpay:0" && /Refresh/.test(b.text));
  expect(refresh).toBeDefined(); await click(refresh.callback_data);
  expect(user.balance).toBe(42);
});
test("group callbacks do not read private ledger or attempts", async () => {
  await click("histpay:0", { id: -100, type: "supergroup" });
  expect(reads.some((r) => ["transactions", "binance_deposits", "payment_requests"].includes(r.table))).toBe(false);
});