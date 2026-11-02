import { afterEach, expect, mock, test } from "bun:test";

const queued: any[] = [];
let failed = false;
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: async (name: string, args: any) => {
    queued.push({ name, args });
    return failed ? { error: { message: "Database unavailable" } } : { data: { id: "job", total: 3084 } };
  },
} }));
mock.module("@/lib/bot/contact.server", () => ({ recordContact: async () => {} }));
const { broadcastMessageFromTelegram, enqueueAdminBroadcast, sendAdminBroadcast } = await import("../../src/lib/bot/admin-broadcast.server");
const originalFetch = globalThis.fetch;
const originalToken = process.env["TELEGRAM_BOT_TOKEN"];
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env["TELEGRAM_BOT_TOKEN"];
  else process.env["TELEGRAM_BOT_TOKEN"] = originalToken;
  failed = false; queued.length = 0;
});

test("native Premium emoji and formatting retain UTF-16 offsets and literal text", async () => {
  const text = "  😀🔥 <b>offer & price</b>\n";
  const entities = [{ type: "custom_emoji", offset: 4, length: 2, custom_emoji_id: "5204116184986844054" }, { type: "bold", offset: 7, length: 5 }];
  const message = broadcastMessageFromTelegram({ text, entities });
  expect(message.text).toBe(text);
  expect(message.entities).toEqual(entities);
  let payload: any;
  process.env["TELEGRAM_BOT_TOKEN"] = "mock-no-real-network";
  globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => { payload = JSON.parse(String(init?.body)); return Response.json({ ok: true }); }) as unknown as typeof fetch;
  expect((await sendAdminBroadcast(77, message)).ok).toBe(true);
  expect(payload.text).toBe(text);
  expect(payload.entities).toEqual(entities);
  expect(payload.parse_mode).toBeUndefined();
  expect(payload.allow_paid_broadcast).toBeUndefined();
});

test("photos preserve caption Premium emoji entities and use the largest photo", () => {
  const entities = [{ type: "custom_emoji", offset: 0, length: 2, custom_emoji_id: "5204116184986844054" }];
  expect(broadcastMessageFromTelegram({ photo: [{ file_id: "small" }, { file_id: "large" }], caption: "🔥 hello", caption_entities: entities })).toEqual({ kind: "broadcast", photo: "large", text: "🔥 hello", entities });
});

test("queues by source message identity and uses full server-selected audience", async () => {
  expect(await enqueueAdminBroadcast(77, { message_id: 8, text: "/products" })).toEqual({ id: "job", total: 3084 });
  expect(queued[0]).toEqual({ name: "enqueue_bot_broadcast", args: { _event_key: "broadcast:77:8", _message: { kind: "broadcast", text: "/products", entities: [] } } });
});

test("invalid content and failed persistence never report successful queueing", async () => {
  await expect(enqueueAdminBroadcast(77, { message_id: 8 })).rejects.toThrow("Send text");
  expect(queued).toHaveLength(0);
  failed = true;
  await expect(enqueueAdminBroadcast(77, { message_id: 8, text: "hello" })).rejects.toThrow("Database unavailable");
});

test("Telegram text and caption limits are enforced without truncation", () => {
  expect(broadcastMessageFromTelegram({ text: "a".repeat(4096) }).text.length).toBe(4096);
  expect(() => broadcastMessageFromTelegram({ text: "a".repeat(4097) })).toThrow("limit");
  expect(() => broadcastMessageFromTelegram({ photo: [{ file_id: "photo" }], caption: "a".repeat(1025) })).toThrow("limit");
});

test("definitive Premium rejection removes only custom entities, not text or formatting", async () => {
  const calls: any[] = [];
  process.env["TELEGRAM_BOT_TOKEN"] = "mock-no-real-network";
  globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    return calls.length === 1 ? Response.json({ ok: false, error_code: 400, description: "Custom emoji not allowed" }, { status: 400 }) : Response.json({ ok: true });
  }) as unknown as typeof fetch;
  const text = "🔥 <sale> & more";
  await sendAdminBroadcast(77, broadcastMessageFromTelegram({ text, entities: [{ type: "custom_emoji", offset: 0, length: 2, custom_emoji_id: "5204116184986844054" }, { type: "bold", offset: 3, length: 6 }] }));
  expect(calls).toHaveLength(2);
  expect(calls[1].text).toBe(text);
  expect(calls[1].entities).toEqual([{ type: "bold", offset: 3, length: 6 }]);
});

test("uncertain failures never trigger a second immediate broadcast send", async () => {
  let calls = 0;
  process.env["TELEGRAM_BOT_TOKEN"] = "mock-no-real-network";
  globalThis.fetch = mock(async () => { calls++; return Response.json({ ok: false, error_code: 500, description: "Server error" }, { status: 500 }); }) as unknown as typeof fetch;
  expect((await sendAdminBroadcast(77, broadcastMessageFromTelegram({ text: "<literal>" }))).ok).toBe(false);
  expect(calls).toBe(1);
});