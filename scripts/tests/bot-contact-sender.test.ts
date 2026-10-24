import { expect, mock, test } from "bun:test";

const evidence: any[] = [];
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: async (name: string, data: any) => {
  evidence.push({ name, ...data });
  return { error: null };
} } }));
const { tg } = await import("../../src/lib/telegram.server");

test("actual Telegram sender persists confirmed failure and subsequent successful delivery", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env["TELEGRAM_BOT_TOKEN"];
  process.env["TELEGRAM_BOT_TOKEN"] = "mock-token-no-real-network";
  try {
    globalThis.fetch = mock(async () => Response.json({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }, { status: 403 })) as unknown as typeof fetch;
    expect((await tg("sendMessage", { chat_id: 12345, text: "test" })).ok).toBe(false);
    expect(evidence[0].name).toBe("record_bot_contact");
    expect(evidence[0]._telegram_id).toBe(12345);
    expect(evidence[0]._status).toBe("blocked");
    expect(Number.isNaN(Date.parse(evidence[0]._observed_at))).toBe(false);
    globalThis.fetch = mock(async () => Response.json({ ok: true, result: { message_id: 1 } })) as unknown as typeof fetch;
    expect((await tg("sendMessage", { chat_id: 12345, text: "test" })).ok).toBe(true);
    expect(evidence[1]._status).toBe("reachable");
    await tg("sendMessage", { chat_id: -100123, text: "test" });
    expect(evidence.length).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env["TELEGRAM_BOT_TOKEN"];
    else process.env["TELEGRAM_BOT_TOKEN"] = originalToken;
  }
});