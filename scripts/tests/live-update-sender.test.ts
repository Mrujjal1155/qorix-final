import { expect, mock, test } from "bun:test";

const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const rows = ids.map((id, i) => ({ id: `event-${i}`, ref: `order:${id}`, kind: "purchase", status: "pending", attempts: 0,
  created_at: "2026-10-24T19:00:00Z", payload: { product: "Same name", source: ["telegram", "website", "api_bot"][i] } }));
const sent: any[] = [];
const reads: Array<{ table: string; columns: string; values?: unknown[] }> = [];
let iconFailure = false;
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    let update: any;
    let selected = "";
    let wanted: unknown[] | undefined;
    const filters: Record<string, unknown> = {};
    const result = () => {
      if (table === "bot_settings") return { data: [{ key: "live_channel_id", value: "@test" }, { key: "bot_username", value: "QORIX3_bot" }] };
      if (table === "orders") {
        reads.push({ table, columns: selected, values: wanted });
        return { data: ids.map((id, i) => ({ id, product_id: `product-${i}` })), error: iconFailure ? { message: "Unavailable" } : null };
      }
      if (table === "products") {
        reads.push({ table, columns: selected, values: wanted });
        return { data: [{ id: "product-0", telegram_custom_emoji_id: "5204116184986844054" }, { id: "product-1", telegram_custom_emoji_id: "5304116184986844055" }], error: null };
      }
      if (table === "live_update_events") {
        // Fail if the sender ever requests a nonexistent event key column.
        if (selected.includes("event_key")) throw new Error("Unknown column event_key");
        const found = rows.filter((r: any) => Object.entries(filters).every(([k, v]) => r[k] === v));
        if (update) found.forEach((r) => Object.assign(r, update));
        return { data: found, error: null };
      }
      throw new Error(`Unexpected table ${table}`);
    };
    const chain: any = {
      select: (columns: string) => { selected = columns; return chain; },
      eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      in: (_key: string, values: unknown[]) => { wanted = values; return chain; },
      update: (value: unknown) => { update = value; return chain; },
      or: () => chain, order: () => chain, limit: () => chain,
      then: (resolve: any, reject: any) => Promise.resolve().then(result).then(resolve, reject),
    };
    return chain;
  },
} }));
mock.module("@/lib/telegram.server", () => ({
  sendAlertMessage: async (channel: string, text: string, keyboard: any) => { sent.push({ channel, text, keyboard }); return { ok: true }; },
}));
const { drainLiveUpdates } = await import("../../src/lib/live-update.server");

test("scheduled sender uses each exact purchased product icon across bot, website and reseller sales", async () => {
  expect(await drainLiveUpdates()).toEqual({ sent: 3 });
  expect(sent.map((s) => s.keyboard[0][0].icon_custom_emoji_id)).toEqual(["5204116184986844054", "5304116184986844055", undefined]);
  expect(sent.map((s) => s.keyboard[0][0].url)).toEqual(Array(3).fill("https://t.me/QORIX3_bot"));
  expect(rows.map((r) => r.status)).toEqual(["sent", "sent", "sent"]);
  expect(reads).toEqual([
    { table: "orders", columns: "id,product_id", values: ids },
    { table: "products", columns: "id,telegram_custom_emoji_id", values: ["product-0", "product-1", "product-2"] },
  ]);
});
test("icon lookup failure keeps events pending for retry without posting a wrong icon", async () => {
  rows.forEach((r) => { r.status = "pending"; });
  iconFailure = true;
  const before = sent.length;
  try {
    await expect(drainLiveUpdates()).rejects.toThrow("Could not load purchase icons");
    expect(rows.map((r) => r.status)).toEqual(["pending", "pending", "pending"]);
    expect(sent.length).toBe(before);
  } finally { iconFailure = false; }
  expect(await drainLiveUpdates()).toEqual({ sent: 3 });
});