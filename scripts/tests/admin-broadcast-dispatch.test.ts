import { expect, mock, test } from "bun:test";
const user: any = { telegram_id: 77, first_name: "Admin", last_name: null, username: "admin", is_banned: false, state: {} };
let queueFails = false;
const jobs: any[] = [];
const replies: string[] = [];
let drains = 0;
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    let change: any;
    const result = () => {
      if (table === "bot_users" && change) Object.assign(user, change);
      return { data: table === "bot_settings" ? [{ key: "admin_telegram_ids", value: "77" }] : table === "bot_users" ? user : [], error: null };
    };
    const chain: any = { select: () => chain, eq: () => chain, order: () => chain, range: () => chain, in: () => chain, lt: () => chain, lte: () => chain, limit: () => chain,
      update: (value: any) => { change = value; return chain; }, maybeSingle: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve) };
    return chain;
  }, rpc: async () => ({ data: [], error: null }),
} }));
mock.module("@/lib/bot/admin-broadcast.server", () => ({ enqueueAdminBroadcast: async (chatId: number, msg: any) => {
  if (queueFails || !msg.text) throw new Error("Could not save broadcast");
  jobs.push({ chatId, msg }); return { id: "job", total: 3084 };
} }));
mock.module("@/lib/bot/stock-audience.server", () => ({ drainStockAudience: async () => { drains++; return { sent: 0, retry: 0 }; } }));
mock.module("@/lib/bot/contact.server", () => ({ recordContact: async () => {} }));
mock.module("@/lib/bg.server", () => ({ backgroundWaitUntil: () => false }));
mock.module("@/lib/telegram.server", () => ({
  sendMessage: async (_id: number, text: string) => { replies.push(text); return { ok: true }; },
  answerCallback: async () => ({ ok: true }), editMessage: async () => ({ ok: true }),
  tg: async () => ({ ok: true }), deleteMessage: async () => ({ ok: true }), getMe: async () => ({ ok: true }),
  isCustomEmojiBlocked: () => false, sendDocument: async () => ({}), sendDocumentUpload: async () => ({}),
  sendAlertMessage: async () => ({}), sendPhoto: async () => ({}), sendAnimation: async () => ({}), COMMAND_LIST: [],
  styleRows: (rows: any) => rows, styled: (button: any) => button,
}));
const { handleUpdate } = await import("../../src/lib/bot/engine.server");
const from = { id: 77, first_name: "Admin", username: "admin" };
async function message(text?: string) {
  await handleUpdate({ message: { message_id: 8, from, chat: { id: 77, type: "private" }, text, entities: [{ type: "bold", offset: 0, length: 3 }] } });
}

test("admin Broadcast click → command-like message → durable queue → paced drain", async () => {
  await handleUpdate({ callback_query: { id: "click", data: "adm:broadcast", from, message: { message_id: 1, chat: { id: 77, type: "private" } } } });
  expect(user.state.awaiting).toBe("broadcast");
  await message("/products");
  expect(jobs).toHaveLength(1);
  expect(jobs[0].msg.text).toBe("/products");
  expect(jobs[0].msg.entities[0].type).toBe("bold");
  expect(user.state.awaiting).toBeNull();
  expect(drains).toBe(1);
});

test("failed save retains the broadcast prompt for a corrected message", async () => {
  user.state = { awaiting: "broadcast" }; queueFails = true;
  await message("Retry me");
  expect(user.state.awaiting).toBe("broadcast");
  expect(jobs).toHaveLength(1);
  queueFails = false;
  await message("Corrected message");
  expect(jobs).toHaveLength(2);
  expect(user.state.awaiting).toBeNull();
});

test("non-admin pending state cannot create a broadcast", async () => {
  const prior = user.telegram_id;
  user.telegram_id = 88; user.state = { awaiting: "broadcast" };
  await handleUpdate({ message: { message_id: 9, from: { id: 88, first_name: "Customer" }, chat: { id: 88, type: "private" }, text: "attack" } });
  expect(jobs).toHaveLength(2);
  expect(drains).toBe(2);
  user.telegram_id = prior;
});