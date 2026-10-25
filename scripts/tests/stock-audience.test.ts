import { expect, mock, test } from "bun:test";

const sentTo: number[] = [];
mock.module("@/lib/telegram.server", () => ({ sendAlertMessage: async (id: number) => {
  sentTo.push(id);
  return id === 2 ? { ok: false, description: "temporary timeout" }
    : id === 5 ? { ok: false, description: "rate limit", parameters: { retry_after: 120 } }
    : id === 3 ? { ok: false, description: "Forbidden: bot was blocked by the user" } : { ok: true };
} }));
const { drainStockAudience } = await import("../../src/lib/bot/stock-audience.server");

test("fast dispatch sends more than ten recipients in paced waves without losing anyone", async () => {
  let clock = 0;
  const waits: number[] = [];
  const ids = Array.from({ length: 24 }, (_, i) => i + 100);
  const db = {
    rpc: async (name: string) => {
      expect(name).toBe("claim_stock_notification_recipients_fast");
      return { data: ids.map(telegram_id => ({ event_id: "fast", telegram_id, message: { text: "notice", kind: "new" } })), error: null };
    },
    from: () => ({ update: () => {
      const chain: any = { eq: () => chain, then: (resolve: any) => resolve({ error: null }) };
      return chain;
    } }),
  };
  const result = await drainStockAudience(db, { now: () => clock, wait: async ms => { waits.push(ms); clock += ms; } });
  expect(result.sent).toBe(24);
  expect(waits).toEqual([600, 600, 600]);
  expect(ids.every(id => sentTo.includes(id))).toBe(true);
  sentTo.length = 0;
});

test("all claimed customers are sent independently; only successful customers complete subscriptions", async () => {
  const updates: any[] = [];
  const db = {
    rpc: async () => ({ data: [1, 2, 3, 4].map(telegram_id => ({ event_id: "event", telegram_id, message: { text: "Stock available", product_id: "product", kind: "restock" } })), error: null }),
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

test("Telegram retry_after is preserved rather than retried too early", async () => {
  let saved: any;
  const db = {
    rpc: async () => ({ data: [{ event_id: "rate", telegram_id: 5, message: { text: "notice" } }] }),
    from: () => ({ update: (value: any) => {
      saved = value;
      const chain: any = { eq: () => chain, then: (resolve: any) => resolve({ error: null }) };
      return chain;
    } }),
  };
  expect(await drainStockAudience(db, { now: () => 0, wait: async () => {} })).toEqual({ sent: 0, retry: 1 });
  expect(saved.status).toBe("retry");
  expect(saved.next_attempt_at).toBe("1970-01-01T00:02:00.000Z");
});

test("time budget releases untouched recipients without falsely marking them sent", async () => {
  let clock = 0;
  const updates: any[] = [];
  const db = {
    rpc: async () => ({ data: Array.from({ length: 12 }, (_, i) => ({ event_id: "budget", telegram_id: 200 + i, message: { text: "notice", kind: "new" } })) }),
    from: () => ({ update: (value: any) => {
      updates.push(value);
      const chain: any = { eq: () => chain, then: (resolve: any) => resolve({ error: null }) };
      return chain;
    } }),
  };
  expect(await drainStockAudience(db, { now: () => clock, wait: async () => { clock = 10_000; } })).toEqual({ sent: 6, retry: 0 });
  expect(updates.filter(row => row.status === "pending")).toHaveLength(6);
  expect(sentTo.includes(206)).toBe(false);
});