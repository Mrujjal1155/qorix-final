import { afterEach, describe, expect, mock, test } from "bun:test";
import { supplierBalance, supplierOrder, supplierPing, supplierProducts, supplierSupportsWebhooks } from "../../src/lib/suppliers/api.server";

const originalFetch = globalThis.fetch;
const supplier = { id: "test", key: "insightstore", name: "Insight Store", base_url: "https://api.insightxpro.store", api_key: "fixture-not-a-real-key" };
afterEach(() => { globalThis.fetch = originalFetch; });
function respond(data: unknown, status = 200) {
  const fn = mock(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(data), { status }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}
describe("Insight Store documented contract", () => {
  function sequence(responses: unknown[]) {
    let index = 0;
    const fn = mock(async (_input: string | URL | Request, _init?: RequestInit) => {
      if (index >= responses.length) throw new Error("Unexpected extra supplier request");
      return new Response(JSON.stringify(responses[index++]), { status: 200 });
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    return fn;
  }
  const failed = { order_id: 6922, product_id: 46, quantity: 1, status: "failed", amount_usdt: 4, codes: [] };
  const completed = { ...failed, order_id: 6923, status: "completed", codes: ["ACCOUNT\nPASSWORD"] };
  const debit = { kind: "order_debit", amount_usdt: -4, ref_type: "api_order", ref_id: "6922" };
  const refund = { kind: "refund", amount_usdt: 4, ref_type: "api_order", ref_id: "6922" };
  test("failed and fully refunded purchase automatically delivers through one deterministic replacement", async () => {
    const fn = sequence([{ order: failed }, { order: failed }, { recent_transactions: [debit, refund] }, { order: completed }]);
    expect(await supplierOrder(supplier, "46", 1, "original-reference")).toEqual({ code: "6923", items: ["ACCOUNT\nPASSWORD"] });
    expect(fn.mock.calls.map(([url]) => url)).toEqual([
      "https://api.insightxpro.store/api/v1/orders", "https://api.insightxpro.store/api/v1/orders/6922",
      "https://api.insightxpro.store/api/v1/balance", "https://api.insightxpro.store/api/v1/orders",
    ]);
    const bodies = fn.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      { product_id: 46, quantity: 1, idempotency_key: "original-reference" },
      { product_id: 46, quantity: 1, idempotency_key: "original-reference:refunded:6922" },
    ]);
  });
  for (const [label, transactions] of [
    ["missing refund", [debit]], ["partial refund", [debit, { ...refund, amount_usdt: 3 }]],
    ["other order refund", [debit, { ...refund, ref_id: "9999" }]],
    ["missing debit", [refund]], ["duplicate refund evidence", [debit, refund, refund]],
  ] as const) {
    test(`${label} never starts another purchase`, async () => {
      const fn = sequence([{ order: failed }, { order: failed }, { recent_transactions: transactions }]);
      await expect(supplierOrder(supplier, "46", 1, "stable")).rejects.toThrow("needs review");
      expect(fn.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    });
  }
  test("pending purchase readback completes delivery without another POST", async () => {
    const fn = sequence([{ order: { ...failed, status: "pending" } }, { order: { ...completed, order_id: 6922, coupons: completed.codes, codes: [] } }]);
    expect(await supplierOrder(supplier, "46", 1, "stable")).toEqual({ code: "6922", items: ["ACCOUNT\nPASSWORD"] });
    expect(fn.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  test("repeating the same order reuses both keys instead of creating a third purchase identity", async () => {
    const replies = [{ order: failed }, { order: failed }, { recent_transactions: [debit, refund] }, { order: completed }];
    const fn = sequence([...replies, ...replies]);
    await supplierOrder(supplier, "46", 1, "original-reference");
    await supplierOrder(supplier, "46", 1, "original-reference");
    const keys = fn.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)).idempotency_key);
    expect(keys).toEqual(["original-reference", "original-reference:refunded:6922", "original-reference", "original-reference:refunded:6922"]);
    expect(new Set(keys).size).toBe(2);
  });
  test("second failed purchase stops rather than forming an endless retry loop", async () => {
    const second = { ...failed, order_id: 6923 };
    const fn = sequence([{ order: failed }, { order: failed }, { recent_transactions: [debit, refund] }, { order: second }, { order: second }]);
    await expect(supplierOrder(supplier, "46", 1, "stable")).rejects.toThrow("needs review");
    expect(fn.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
  });
  test("partial failed delivery never becomes a replacement purchase", async () => {
    const fn = sequence([{ order: { ...failed, quantity: 2, codes: ["ONE-ACCOUNT"] } }]);
    await expect(supplierOrder(supplier, "46", 2, "stable")).rejects.toThrow("needs review");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  test("mismatched readback order cannot authorize another purchase", async () => {
    const fn = sequence([{ order: failed }, { order: { ...failed, order_id: 9999 } }]);
    await expect(supplierOrder(supplier, "46", 1, "stable")).rejects.toThrow("needs review");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  test("uses the wallet cost, not the reseller selling price, and includes sold-out rows", async () => {
    const fn = respond({ products: [
      { id: 14, name: "Gemini", price: 1.5, price_usdt: 1.5, base_price_usdt: 1, stock: 250, available: true, description: "<blockquote>18 Months</blockquote>", how_to_use: "Redeem" },
      { id: 21, name: "Sold out", base_price_usdt: 3, stock: 0, available: false },
      { id: 22, name: "Unlimited", base_price_usdt: 2, stock: 999999, unlimited: true, available: true },
    ] });
    const rows = await supplierProducts(supplier);
    expect(fn.mock.calls[0]?.[0]).toBe("https://api.insightxpro.store/api/v1/products?include_unavailable=1");
    expect(rows.map(p => p.cost_price)).toEqual([1, 3, 2]);
    expect(rows.map(p => p.stock)).toEqual([250, 0, 999999]);
    expect(rows[0]?.raw.how_to_use).toBe("Redeem");
  });
  test("balance and connection test use the documented balance endpoint; no webhooks", async () => {
    const fn = respond({ balance_usdt: 148.25, status: "active" });
    expect(await supplierBalance(supplier)).toEqual({ balance: 148.25, currency: "USDT" });
    expect(await supplierPing(supplier)).toEqual({ ok: true, status: "active" });
    expect(fn.mock.calls[0]?.[0]).toBe("https://api.insightxpro.store/api/v1/balance");
    expect(supplierSupportsWebhooks(supplier)).toBe(false);
  });
  test("one bulk call retains the exact idempotency reference and delivered text", async () => {
    const fn = respond({ order: { order_id: 6782, product_id: 14, quantity: 2, status: "completed", codes: ["KEY-A\nsecret", "KEY-B"] } });
    expect(await supplierOrder(supplier, "14", 2, "my-order-99812")).toEqual({ code: "6782", items: ["KEY-A\nsecret", "KEY-B"] });
    expect(fn).toHaveBeenCalledTimes(1);
    const init = fn.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual({ product_id: 14, quantity: 2, idempotency_key: "my-order-99812" });
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("X-API-Key")).toBe(supplier.api_key);
  });
  test("uncertain failures never retry", async () => {
    const fn = mock(async () => { throw new Error("timeout"); });
    globalThis.fetch = fn as unknown as typeof fetch;
    await expect(supplierOrder(supplier, "14", 2, "stable-ref")).rejects.toThrow("timeout");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  test("partial delivery is review, not a definite rejection", async () => {
    respond({ order: { order_id: 6782, product_id: 14, quantity: 2, status: "completed", codes: ["KEY-A"] } });
    try { await supplierOrder(supplier, "14", 2, "ref"); throw new Error("accepted partial delivery"); }
    catch (error) { expect((error as any).deliveryOutcome).toBeUndefined(); expect(String(error)).toContain("needs review"); }
  });
  test("test deliveries cannot fulfil a real order", async () => {
    respond({ order: { order_id: 0, product_id: 14, quantity: 1, status: "completed", test: true, codes: ["TEST-A014-0001"] } });
    await expect(supplierOrder(supplier, "14", 1, "ref")).rejects.toThrow("needs review");
  });
  test("bad host never receives the key", async () => {
    const fn = respond({});
    await expect(supplierBalance({ ...supplier, base_url: "https://untrusted.example" })).rejects.toThrow("Unsupported");
    expect(fn).toHaveBeenCalledTimes(0);
  });
  test("malformed catalogue fails instead of silently setting missing products sold out", async () => {
    respond({});
    await expect(supplierProducts(supplier)).rejects.toThrow("catalogue");
  });
  test("HTTP rejection classified but no automatic HTTP retry", async () => {
    const fn = respond({ error: "rate limit exceeded" }, 429);
    try { await supplierOrder(supplier, "14", 1, "ref"); throw new Error("accepted rejection"); }
    catch (error) { expect((error as any).deliveryOutcome).toBe("rejected"); }
    expect(fn).toHaveBeenCalledTimes(1);
  });
});