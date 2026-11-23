import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { bulkDiscountCard } from "../../src/lib/bot/bulk-discount-card";
import { homeMessageFallback } from "../../src/lib/bot/home-message";

mock.module("@/lib/bot/contact.server", () => ({ recordContact: async () => {} }));
const { sendAlertMessage } = await import("../../src/lib/telegram.server");
const originalFetch = globalThis.fetch;
const originalToken = process.env["TELEGRAM_BOT_TOKEN"];
let calls: Array<{ method: string; body: Record<string, any> }> = [];
let responses: Array<{ ok: boolean; error_code?: number; description?: string }> = [];
const html = bulkDiscountCard({
  productName: "LinkedIn Premium Career — 3 Months (Link)",
  productIcon: '<tg-emoji emoji-id="5204116184986844054">💼</tg-emoji>',
  basePrice: 0.35, channel: "both",
  tiers: [{ min_qty: 5, type: "flat", value: 0.05 }, { min_qty: 10, type: "flat", value: 0.1 }, { min_qty: 15, type: "flat", value: 0.15 }],
  icons: { badge: "🎁", end: "🔥", base: "💵", row: "📦", arrow: "➡️", off: "✨", note: "🎉" },
});
const keyboard = [[{ text: "Buy", callback_data: "p:example", style: "primary" as const }]];

beforeEach(() => {
  calls = []; responses = [];
  process.env["TELEGRAM_BOT_TOKEN"] = "mock-token-no-real-network";
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    calls.push({ method: String(url).split("/").pop() ?? "", body: JSON.parse(String(init?.body)) });
    const response = responses.shift() ?? { ok: true };
    return Response.json(response, { status: response.error_code ?? 200 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env["TELEGRAM_BOT_TOKEN"];
  else process.env["TELEGRAM_BOT_TOKEN"] = originalToken;
});

test("bulk group and private notices both use the rich sender with unchanged buy actions", async () => {
  for (const destination of [-100123456, 12345]) {
    expect((await sendAlertMessage(destination, html, keyboard)).ok).toBe(true);
  }
  expect(calls.map((call) => call.method)).toEqual(["sendRichMessage", "sendRichMessage"]);
  expect(calls.map((call) => call.body['chat_id'])).toEqual([-100123456, 12345]);
  for (const call of calls) {
    expect(call.body['rich_message']).toEqual({ html });
    expect(call.body['reply_markup'].inline_keyboard).toEqual(keyboard);
    expect(call.body['allow_paid_broadcast']).toBeUndefined();
  }
});

test("definitive format rejection uses the ordinary sender and preserves buy actions", async () => {
  responses = [{ ok: false, error_code: 400, description: "Unsupported rich message format" }];
  expect((await sendAlertMessage(12345, html, keyboard)).ok).toBe(true);
  expect(calls.map((call) => call.method)).toEqual(["sendRichMessage", "sendMessage"]);
  expect(calls[1]?.body['text']).toBe(homeMessageFallback(html));
  expect(calls[1]?.body['reply_markup'].inline_keyboard).toEqual(keyboard);
});

test("uncertain failures never trigger a second send", async () => {
  responses = [{ ok: false, error_code: 500, description: "Internal error" }];
  expect((await sendAlertMessage(12345, html, keyboard)).ok).toBe(false);
  expect(calls).toHaveLength(1);
});