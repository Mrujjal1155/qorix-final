import { expect, mock, test } from "bun:test";

const sentTo: number[] = [];
mock.module("@/lib/bot/admin-broadcast.server", () => ({ sendAdminBroadcast: async (id: number) => { sentTo.push(id); return { ok: true }; } }));
mock.module("@/lib/telegram.server", () => ({ sendAlertMessage: async (id: number) => {
  sentTo.push(id);
  return id === 2 ? { ok: false, description: "temporary timeout" }
    : id === 5 ? { ok: false, description: "rate limit", parameters: { retry_after: 120 } }
    : id === 3 ? { ok: false, description: "Forbidden: bot was blocked by the user" } : { ok: true };
} }));
const { drainStockAudience: drain } = await import("../../src/lib/bot/stock-audience.server");
function drainStockAudience(db: any, runtime?: Parameters<typeof drain>[1]) {
  const original = db.rpc;
  return drain({ ...db, rpc: async (name: string, args: any) => name === "active_stock_notification_claims"
    ? { data: args._event_ids.map((event_id: string, i: number) => ({ event_id, telegram_id: args._telegram_ids[i] })) }
    : original(name, args) }, runtime);
}

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
  expect(waits).toEqual([200, 200, 200]);
  expect(ids.every(id => sentTo.includes(id))).toBe(true);
  sentTo.length = 0;
});

test("free broadcasts start thirty distinct recipients per second without a larger burst", async () => {
  let clock = 0;
  const waves: { at: number; count: number }[] = [];
  let count = 0;
  const db = {
    rpc: async () => ({ data: Array.from({ length: 60 }, (_, i) => ({ event_id: "pace", telegram_id: 300 + i, message: { text: "notice", kind: "new" } })) }),
    from: () => ({ update: () => {
      count += 1;
      const chain: any = { eq: () => chain, then: (resolve: any) => resolve({ error: null }) };
      return chain;
    } }),
  };
  const result = await drainStockAudience(db, { now: () => clock, wait: async ms => {
    waves.push({ at: clock, count }); count = 0; clock += ms;
  } });
  waves.push({ at: clock, count });
  expect(result.sent).toBe(60);
  expect(waves.every(w => w.count === 6)).toBe(true);
  expect(waves.filter(w => w.at < 1_000).reduce((n, w) => n + w.count, 0)).toBe(30);
  expect(waves.map(w => w.at)).toEqual([0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800]);
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

test("queued admin broadcasts use the shared paced sender and successful checkpoint", async () => {
  sentTo.length = 0;
  let saved: any;
  const db = {
    rpc: async () => ({ data: [{ event_id: "broadcast", telegram_id: 77, message: { kind: "broadcast", text: "Premium", entities: [] } }] }),
    from: () => ({ update: (value: any) => { saved = value; const chain: any = { eq: () => chain, then: (resolve: any) => resolve({ error: null }) }; return chain; } }),
  };
  expect(await drainStockAudience(db)).toEqual({ sent: 1, retry: 0 });
  expect(sentTo).toEqual([77]);
  expect(saved.status).toBe("sent");
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

test("queued product tables deliver to users and negative group IDs through the shared sender", async () => {
  sentTo.length = 0;
  const statuses: string[] = [];
  const db = {
    rpc: async () => ({ data: [77,-100123].map(telegram_id => ({event_id:"list",telegram_id,message:{kind:"product_list",text:"<table><tr><td>Product</td><td>$1</td></tr></table>"}})) }),
    from: () => ({update:(value: any) => {statuses.push(value.status); const chain:any={eq:()=>chain,then:(resolve:any)=>resolve({error:null})};return chain;}}),
  };
  expect(await drainStockAudience(db)).toEqual({sent:2,retry:0});
  expect(sentTo).toEqual([77,-100123]);
  expect(statuses).toEqual(["sent","sent"]);
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

test("admin cancellation between waves prevents remaining customer sends", async () => {
  sentTo.length = 0;
  let checks = 0;
  const db = {
    rpc: async (name: string, args: any) => name === "active_stock_notification_claims"
      ? { data: checks++ === 0 ? args._telegram_ids.map((telegram_id: number) => ({ event_id: "cancel", telegram_id })) : [] }
      : { data: Array.from({ length: 12 }, (_, i) => ({ event_id: "cancel", telegram_id: 800 + i, message: { text: "notice", kind: "price" } })) },
    from: () => ({ update: () => { const chain: any = { eq: () => chain, then: (resolve: any) => resolve({ error: null }) }; return chain; } }),
  };
  const result = await drain(db, { now: () => 0, wait: async () => {} });
  expect(result.sent).toBe(6);
  expect(sentTo).toEqual([800, 801, 802, 803, 804, 805]);
});

test("failed cancellation check never sends customer messages", async () => {
  sentTo.length = 0;
  const db = { rpc: async (name: string) => name === "active_stock_notification_claims"
    ? { error: { message: "offline" } } : { data: [{ event_id: "cancel", telegram_id: 900, message: { text: "price" } }] } };
  await expect(drain(db)).rejects.toThrow("cancellation check failed");
  expect(sentTo).toEqual([]);
});