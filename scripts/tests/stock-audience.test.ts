import { expect, mock, test } from "bun:test";

const sentTo: number[] = [];
mock.module("@/lib/telegram.server", () => ({ sendAlertMessage: async (id: number) => {
  sentTo.push(id);
  return id === 2 ? { ok: false, description: "temporary timeout" }
    : id === 3 ? { ok: false, description: "Forbidden: bot was blocked by the user" } : { ok: true };
} }));
const { drainStockAudience } = await import("../../src/lib/bot/stock-audience.server");

test("all claimed customers are sent independently; only successful customers complete subscriptions", async () => {
  const updates: any[] = [];
  const db = {
    rpc: async () => ({ data: [1, 2, 3, 4].map(telegram_id => ({ event_id: "event", telegram_id, message: { text: "Stock available", product_id: "product" } })), error: null }),
    from: (table: string) => ({ update: (value: any) => {
      const entry = { table, value, filters: {} as Record<string, unknown> }; updates.push(entry);
      const chain: any = { eq: (k: string, v: unknown) => { entry.filters[k] = v; return chain; }, is: () => chain,
        then: (resolve: any) => resolve({ error: null }) };
      return chain;
    } }),
  };
  expect(await drainStockAudience(db)).toEqual({ sent: 2, retry: 1 });
  expect(sentTo.sort()).toEqual([1, 2, 3, 4]);
  const recipients = updates.filter(u => u.table === "stock_notification_recipients");
  expect(recipients.map(u => u.value.status)).toEqual(["sent", "retry", "unreachable", "sent"]);
  expect(updates.filter(u => u.table === "stock_alerts").map(u => u.filters.telegram_id)).toEqual([1, 4]);
});

test("database claim failure is not reported as successful delivery", async () => {
  await expect(drainStockAudience({ rpc: async () => ({ error: { message: "Unavailable" } }) })).rejects.toThrow("Customer notification claim failed");
});