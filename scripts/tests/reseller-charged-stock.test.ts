import { beforeEach, expect, mock, test } from "bun:test";

let completed = false;
let claims = 0;
let debits = 0;
let rpcError = false;
const calls: string[] = [];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (name: string, args: { _order_id: string }) => {
      calls.push(name);
      if (name === "reseller_adjust_balance") debits++;
      if (rpcError) return { data: null, error: { message: "interrupted" } };
      if (args._order_id !== "paid-order") return { data: { status: "not_charged" }, error: null };
      const changed = !completed;
      if (changed) { claims++; completed = true; }
      return { data: { status: "completed", changed, quantity: 1 }, error: null };
    },
  },
}));
const { fulfillChargedResellerStock } = await import("../../src/lib/reseller/charged-stock.server");
beforeEach(() => { completed = false; claims = 0; debits = 0; rpcError = false; calls.length = 0; });

test("already-paid order delegates to atomic fulfilment without another debit", async () => {
  expect(await fulfillChargedResellerStock("paid-order")).toEqual({ status: "completed", changed: true, quantity: 1 });
  expect(calls).toEqual(["fulfill_charged_reseller_stock"]);
  expect(debits).toBe(0);
});
test("repeat call does not request separate stock claims or wallet debits", async () => {
  await fulfillChargedResellerStock("paid-order");
  expect((await fulfillChargedResellerStock("paid-order")).changed).toBe(false);
  expect(claims).toBe(1);
  expect(debits).toBe(0);
  expect(calls).toEqual(["fulfill_charged_reseller_stock", "fulfill_charged_reseller_stock"]);
});
test("unpaid order does not trigger a charge in charged-order recovery", async () => {
  expect((await fulfillChargedResellerStock("unpaid-order")).status).toBe("not_charged");
  expect(claims).toBe(0);
  expect(debits).toBe(0);
});
test("interrupted fulfilment surfaces retry rather than debiting or claiming separately", async () => {
  rpcError = true;
  await expect(fulfillChargedResellerStock("paid-order")).rejects.toThrow("automatic recovery will retry");
  expect(debits).toBe(0);
  expect(calls).toEqual(["fulfill_charged_reseller_stock"]);
});