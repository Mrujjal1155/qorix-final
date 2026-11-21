import { afterEach, expect, mock, test } from "bun:test";
import { insightRecoverDelivery } from "../../src/lib/suppliers/insight.server";

const supplier = { id: "test", key: "insightstore", name: "Fixture", base_url: "https://api.insightxpro.store", api_key: "fixture" };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const done = { order_id: 6922, product_id: 46, quantity: 1, idempotency_key: "original-key", status: "completed", codes: ["ACCOUNT"] };
function replies(values: unknown[]) {
  let index = 0;
  const calls: string[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    expect(init?.method).toBe("GET");
    calls.push(String(url));
    if (index >= values.length) throw new Error("Unexpected request");
    return new Response(JSON.stringify(values[index++]));
  }) as unknown as typeof fetch;
  return calls;
}
test("existing complete delivery is retrieved without a purchase", async () => {
  const calls = replies([{ orders: [done] }, { order: done }]);
  expect(await insightRecoverDelivery(supplier, "46", 1, "original-key")).toEqual({ code: "6922", items: ["ACCOUNT"] });
  expect(calls).toHaveLength(2);
});
test("missing legacy reference never guesses from product or timestamps", async () => {
  const calls = replies([]);
  await expect(insightRecoverDelivery(supplier, "46", 1)).rejects.toThrow("reference is unavailable");
  expect(calls).toHaveLength(0);
});
test("duplicate reference history remains blocked", async () => {
  const calls = replies([{ orders: [done, { ...done, order_id: 6923 }] }]);
  await expect(insightRecoverDelivery(supplier, "46", 1, "original-key")).rejects.toThrow("not uniquely");
  expect(calls).toHaveLength(1);
});
test("provider GET must match reference and product", async () => {
  replies([{ orders: [done] }, { order: { ...done, product_id: 47 } }]);
  await expect(insightRecoverDelivery(supplier, "46", 1, "original-key")).rejects.toThrow("does not match");
});
test("failed refunded purchase cannot be marked completed or repurchased", async () => {
  const calls = replies([{ orders: [done] }, { order: { ...done, status: "failed", codes: [], amount_usdt: 4 } }, { recent_transactions: [
    { ref_type: "api_order", ref_id: 6922, kind: "order_debit", amount_usdt: -4 },
    { ref_type: "api_order", ref_id: 6922, kind: "refund", amount_usdt: 4 },
  ] }]);
  await expect(insightRecoverDelivery(supplier, "46", 1, "original-key")).rejects.toThrow("fully refunded");
  expect(calls).toHaveLength(3);
});