import { expect, mock, test } from "bun:test";

const user: any = { telegram_id: 123, first_name: "Test", state: {}, balance: 0, total_spent: 0 };
let deposit: any;
let buttons: any[][] = [];
let credits = 0;
let chainEnabled = true;
const chainId = `0x${"a".repeat(64)}`;
mock.module("@/lib/blockchain.server", () => ({ blockchainGateways: async () => [{ network: "bep20", address: "0x1111111111111111111111111111111111111111", enabled: chainEnabled, verified: true }], findChainPayment: async () => ({ ok: true, txid: chainId, amount: 10.25 }) }));
mock.module("@/lib/bybit.server", () => ({ bybitSettings: async () => ({ bybit_enabled: "1", bybit_api_verified: "1", bybit_uid: "98765" }), findBybitPayment: async () => ({ ok: true, txid: chainId, amount: 10.25 }) }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const result = () => ({ data: table === "bot_users" ? user : table === "binance_deposits" ? deposit : table === "binance_used_txs" ? null : [], error: null });
    const chain: any = {
      select: () => chain, eq: () => chain, neq: () => chain, in: () => chain, not: () => chain, gt: () => chain, gte: () => chain, lt: () => chain, or: () => chain, order: () => chain, range: () => chain, limit: () => chain,
      insert: (value: any) => { if (table === "binance_deposits") deposit = { ...value, id: "00000000-0000-0000-0000-000000000123", status: "pending", created_at: new Date(Date.now() - 1000).toISOString() }; return chain; },
      update: (value: any) => { if (table === "bot_users" && value.state) user.state = value.state; if (table === "binance_deposits") Object.assign(deposit, value); return chain; },
      maybeSingle: async () => result(), single: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
  rpc: async (name: string, args: any) => {
    if (name === "settle_blockchain_bot") {
      expect(args._txid).toBe(chainId);
      expect(args._amount).toBe(10.25);
      if (deposit.status === "credited") return { data: { changed: false }, error: null };
      deposit.status = "credited"; user.balance += 10.25; credits++;
      return { data: { changed: true }, error: null };
    }
    return { data: null, error: null };
  },
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
async function click(data: string) {
  await handleUpdate({ callback_query: { id: "test", data, from: { id: 123, first_name: "Test" }, message: { message_id: 1, chat: { id: 123, type: "private" } } } });
}
async function reply(text: string) {
  await handleUpdate({ message: { message_id: 2, text, from: { id: 123, first_name: "Test" }, chat: { id: 123, type: "private" } } });
}
test("real bot wallet → BEP20 → amount → transaction → credit → repeat flow", async () => {
  await click("wallet");
  expect(buttons.flat().some((b) => b.callback_data === "dep:chain_bep20")).toBe(true);
  await click("dep:chain_bep20");
  expect(user.state.bin_kind).toBe("chain_bep20");
  await reply("10.25");
  expect(deposit.kind).toBe("chain_bep20");
  expect(deposit.amount_usdt).toBe(10.25);
  expect(deposit.address).toBe("0x1111111111111111111111111111111111111111");
  await click(`bchk:${deposit.id}`);
  expect(user.state.awaiting).toBe("bin_txid");
  await reply(chainId);
  expect(credits).toBe(1);
  expect(user.balance).toBe(10.25);
  await click(`bchk:${deposit.id}`);
  expect(credits).toBe(1);
  expect(user.balance).toBe(10.25);
});
test("disabled chain cannot start a new deposit", async () => { chainEnabled = false; user.state = {}; await click("dep:chain_bep20"); expect(user.state.awaiting).toBeUndefined(); });
