import { beforeEach, expect, mock, test } from "bun:test";

let paid = false;
let apiSuccess = true;
let deliveryCount = 0;
let settlementCount = 0;
let failSettlement = false;
const order = { id: "order-1", source: "website", payment_method: "chain_bep20", txid: `0x${"a".repeat(64)}`, status: "pending", total: 10.25, created_at: new Date().toISOString() };
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => {
    const chain: any = { select: () => chain, eq: () => chain, update: () => chain, maybeSingle: async () => ({ data: { ...order, meta: { paid } }, error: null }), then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve) };
    return chain;
  },
  rpc: async (name: string, args: any) => {
    if (name === "record_blockchain_website_check") return { data: null, error: null };
    expect(name).toBe("settle_blockchain_website");
    expect(args._txid).toBe(`0x${"a".repeat(64)}`);
    expect(args._amount).toBe(10.25);
    if (failSettlement) return { data: null, error: { message: "duplicate" } };
    settlementCount++;
    const changed = !paid;
    paid = true;
    return { data: { changed, status: "ready" }, error: null };
  },
} }));
mock.module("@/lib/blockchain.server", () => ({ findChainPayment: async (_network: string, claim: any) => {
  expect(claim.txid).toBe(`0x${"a".repeat(64)}`);
  expect(claim.amount).toBe(10.25);
  return apiSuccess ? { ok: true, txid: `0x${"a".repeat(64)}`, amount: 10.25 } : { ok: false, reason: "pending" };
} }));
mock.module("@/lib/eps-settle.server", () => ({ autoDeliver: async () => { deliveryCount++; } }));
const { verifyBlockchainWebsiteOrder } = await import("../../src/lib/blockchain-settle.server");
beforeEach(() => { paid = false; apiSuccess = true; deliveryCount = 0; settlementCount = 0; failSettlement = false; });
test("verified website payment settles atomically then delivers once", async () => {
  expect((await verifyBlockchainWebsiteOrder("order-1"))?.status).toBe("verified");
  expect(settlementCount).toBe(1);
  expect(deliveryCount).toBe(1);
});
test("repeat verification never settles or delivers twice", async () => {
  await verifyBlockchainWebsiteOrder("order-1");
  await verifyBlockchainWebsiteOrder("order-1");
  expect(settlementCount).toBe(1);
  expect(deliveryCount).toBe(1);
});
test("pending provider response cannot settle or deliver", async () => {
  apiSuccess = false;
  expect((await verifyBlockchainWebsiteOrder("order-1"))?.status).toBe("not_found");
  expect(settlementCount).toBe(0);
  expect(deliveryCount).toBe(0);
});
test("duplicate or failed atomic claim cannot deliver", async () => {
  failSettlement = true;
  expect((await verifyBlockchainWebsiteOrder("order-1"))?.status).toBe("error");
  expect(deliveryCount).toBe(0);
});