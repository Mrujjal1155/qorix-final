import { beforeEach, expect, mock, test } from "bun:test";

let status = "completed";
let changed = true;
let rejected = false;
let sends: string[][] = [];
let calls: string[] = [];
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: async (name: string) => { calls.push(name); return { data: { status, changed }, error: null }; },
  from: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: {
      id: "paid", order_no: 42, telegram_id: 100, source: "telegram", product_name: "Own stock", delivered_content: "account-one",
    }, error: null }) }; return q;
  },
} }));
mock.module("@/lib/bot/deliver-items.server", () => ({ deliverItemsToChat: async (_chat: number, _product: string, items: string[]) => {
  sends.push(items); return { sent: rejected ? 0 : items.length, failed: rejected ? 1 : 0, fallbackFile: false };
} }));
mock.module("@/lib/bot/engine.server", () => ({ announceOrderSale: async () => {} }));
const { retryInhouseDelivery } = await import("../../src/lib/inhouse-retry.server");
beforeEach(() => { status = "completed"; changed = true; rejected = false; sends = []; calls = []; });
test("paid in-house retry uses atomic fulfillment without wallet debit", async () => {
  expect((await retryInhouseDelivery("paid")).ok).toBe(true);
  expect(calls).toEqual(["fulfill_paid_inhouse_order"]);
  expect(sends).toEqual([["account-one"]]);
});
test("unpaid order never sends an account", async () => {
  status = "unpaid";
  expect((await retryInhouseDelivery("unpaid")).ok).toBe(false);
  expect(sends).toHaveLength(0);
});
test("refunded order never sends an account", async () => {
  status = "refunded";
  expect((await retryInhouseDelivery("refunded")).ok).toBe(false);
  expect(sends).toHaveLength(0);
});
test("stock shortage does not deliver partial accounts", async () => {
  status = "out_of_stock";
  expect((await retryInhouseDelivery("short-stock")).ok).toBe(false);
  expect(sends).toHaveLength(0);
});
test("Telegram failure can retry the same stored account without another debit", async () => {
  rejected = true;
  expect((await retryInhouseDelivery("paid")).ok).toBe(false);
  rejected = false; changed = false;
  expect((await retryInhouseDelivery("paid")).ok).toBe(true);
  expect(sends).toEqual([["account-one"], ["account-one"]]);
  expect(calls).toEqual(["fulfill_paid_inhouse_order", "fulfill_paid_inhouse_order"]);
});