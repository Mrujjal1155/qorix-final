import { afterEach, describe, expect, mock, test } from "bun:test";
import { supplierBalance, supplierOrder, supplierPing, supplierProducts, supplierSupportsWebhooks } from "../../src/lib/suppliers/api.server";

const originalFetch = globalThis.fetch;
const supplier = { id: "test", key: "insightstore", name: "Insight Store", base_url: "https://api.insightxpro.store", api_key: "fixture-not-a-real-key" };
afterEach(() => { globalThis.fetch = originalFetch; });
function respond(data: unknown, status = 200) {
  const fn = mock(async () => new Response(JSON.stringify(data), { status }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}
describe("Insight Store documented contract", () => {
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