import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { buildHomeMessage, homeMessageFallback } from "../../src/lib/bot/home-message";

mock.module("@/lib/bot/contact.server", () => ({ recordContact: async () => {} }));
const { sendMessage, editMessage } = await import("../../src/lib/telegram.server");
const originalFetch = globalThis.fetch;
const originalToken = process.env["TELEGRAM_BOT_TOKEN"];
let calls: Array<{ method: string; body: Record<string, any> }> = [];
let responses: Array<{ ok: boolean; error_code?: number; description?: string; result?: object }> = [];
const html = buildHomeMessage({
  header: "Test store", greeting: "Test customer", welcome: "", choose: "Choose",
  account: [["User ID", "12345"]], wallet: [["Balance", "$137.94"]],
  referrals: [['<tg-emoji emoji-id="5204116184986844054">🔗</tg-emoji> Referral', '<a href="https://t.me/test_bot?start=ref_test">Invite</a>']],
});
const keyboard = [[{ text: "Shop", callback_data: "shop:0", icon_custom_emoji_id: "5204116184986844054", style: "primary" as const }]];

beforeEach(() => {
  calls = []; responses = [];
  process.env["TELEGRAM_BOT_TOKEN"] = "mock-token-no-real-network";
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    calls.push({ method: String(url).split("/").pop() ?? "", body: JSON.parse(String(init?.body)) });
    const response = responses.shift() ?? { ok: true, result: { message_id: 7 } };
    return Response.json(response, { status: response.error_code ?? 200 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env["TELEGRAM_BOT_TOKEN"];
  else process.env["TELEGRAM_BOT_TOKEN"] = originalToken;
});

test("welcome sends native rich content with unchanged inline actions", async () => {
  expect((await sendMessage(12345, html, keyboard)).ok).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.method).toBe("sendRichMessage");
  expect(calls[0]?.body.rich_message).toEqual({ html });
  expect(calls[0]?.body.reply_markup.inline_keyboard).toEqual(keyboard);
  expect(calls[0]?.body.text).toBeUndefined();
  expect(calls[0]?.body.allow_paid_broadcast).toBeUndefined();
});

test("start welcome preserves the persistent reply keyboard", async () => {
  const reply_markup = { keyboard: [[{ text: "Products", style: "primary" }]], is_persistent: true };
  await sendMessage(12345, html, undefined, { reply_markup });
  expect(calls[0]?.body.reply_markup).toEqual(reply_markup);
});

test("home callback edits rich content in place and ordinary views still use text", async () => {
  await editMessage(12345, 9, html, keyboard);
  expect(calls[0]?.method).toBe("editMessageText");
  expect(calls[0]?.body.message_id).toBe(9);
  expect(calls[0]?.body.rich_message).toEqual({ html });
  await editMessage(12345, 9, "Normal shop", keyboard);
  expect(calls[1]?.body.text).toBe("Normal shop");
  expect(calls[1]?.body.rich_message).toBeUndefined();
});

test("definitive unsupported method falls back with the same buttons", async () => {
  responses = [{ ok: false, error_code: 404, description: "Not Found: method not supported" }];
  await sendMessage(12345, html, keyboard);
  expect(calls.map((c) => c.method)).toEqual(["sendRichMessage", "sendMessage"]);
  expect(calls[1]?.body.text).toBe(homeMessageFallback(html));
  expect(calls[1]?.body.reply_markup.inline_keyboard).toEqual(keyboard);
});

test("uncertain network/server failure never sends a duplicate fallback", async () => {
  responses = [{ ok: false, error_code: 500, description: "Internal error" }];
  expect((await sendMessage(12345, html, keyboard)).ok).toBe(false);
  expect(calls).toHaveLength(1);
});

test("rich premium emoji rejection retries glyphs without discarding rich content", async () => {
  responses = [{ ok: false, error_code: 400, description: "Custom emoji not allowed" }];
  expect((await sendMessage(12345, html, keyboard)).ok).toBe(true);
  expect(calls.map((c) => c.method)).toEqual(["sendRichMessage", "sendRichMessage"]);
  expect(calls[1]?.body.rich_message).toEqual({ html: html.replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/g, "$1") });
  expect(calls[1]?.body.reply_markup.inline_keyboard[0][0].callback_data).toBe("shop:0");
  expect(calls[1]?.body.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id).toBeUndefined();
});