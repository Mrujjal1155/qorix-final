import { beforeEach, expect, mock, test } from "bun:test";

let paid = false;
let apiSuccess = true;
let deliveryCount = 0;
let settlementCount = 0;
let failSettlement = false;
const order = { id: "order-1", source: "website", payment_method: "bybit", txid: "transfer-123", status: "pending", total: 10.25, created_at: new Date().toISOString() };
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => {
    const chain: any = { select: () => chain, eq: () => chain, update: () => chain, maybeSingle: async () => ({ data: { ...order, meta: { paid } }, error: null }), then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve) };
    return chain;
  },
  rpc: async (name: string, args: any) => {
    if (name === "record_bybit_website_check") return { data: null, error: null };
    expect(name).toBe("settle_bybit_website");
    expect(args._txid).toBe("transfer-123");
    expect(args._amount).toBe(10.25);
    if (failSettlement) return { data: null, error: { message: "duplicate" } };
    settlementCount++;
    const changed = !paid;
    paid = true;
    return { data: { changed, status: "ready" }, error: null };
  },
} }));
mock.module("@/lib/bybit.server", () => ({ findBybitPayment: async (claim: any) => {
  expect(claim.txid).toBe("transfer-123");
  expect(claim.amount).toBe(10.25);
  return apiSuccess ? { ok: true, txid: "transfer-123", amount: 10.25 } : { ok: false, reason: "pending" };
} }));
mock.module("@/lib/eps-settle.server", () => ({ autoDeliver: async () => { deliveryCount++; } }));
const { verifyBybitWebsiteOrder } = await import("../../src/lib/bybit-settle.server");
beforeEach(() => { paid = false; apiSuccess = true; deliveryCount = 0; settlementCount = 0; failSettlement = false; });
test("verified website payment settles atomically then delivers once", async () => {
  expect((await verifyBybitWebsiteOrder("order-1"))?.status).toBe("verified");
  expect(settlementCount).toBe(1);
  expect(deliveryCount).toBe(1);
});
test("repeat verification never settles or delivers twice", async () => {
  await verifyBybitWebsiteOrder("order-1");
  await verifyBybitWebsiteOrder("order-1");
  expect(settlementCount).toBe(1);
  expect(deliveryCount).toBe(1);
});
test("pending provider response cannot settle or deliver", async () => {
  apiSuccess = false;
  expect((await verifyBybitWebsiteOrder("order-1"))?.status).toBe("not_found");
  expect(settlementCount).toBe(0);
  expect(deliveryCount).toBe(0);
});
test("duplicate or failed atomic claim cannot deliver", async () => {
  failSettlement = true;
  expect((await verifyBybitWebsiteOrder("order-1"))?.status).toBe("error");
  expect(deliveryCount).toBe(0);
});