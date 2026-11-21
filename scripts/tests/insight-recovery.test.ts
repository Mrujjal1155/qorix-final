import { afterEach, expect, mock, test } from "bun:test";
import { insightRetryDelivery } from "../../src/lib/suppliers/insight.server";

const supplier = { id: "test", key: "insightstore", name: "Fixture", base_url: "https://api.insightxpro.store", api_key: "fixture" };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const done = { order_id: 6922, product_id: 46, quantity: 1, idempotency_key: "original-key", status: "completed", codes: ["ACCOUNT"] };

/** Fake supplier that honours idempotency: one order per key, charged once. */
function fakeSupplier(history: any[], detail: Record<number, any>, buyResult: (key: string) => any) {
  const charged = new Map<string, any>();
  const posts: string[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "POST") {
      const key = JSON.parse(String(init.body)).idempotency_key;
      posts.push(key);
      if (!charged.has(key)) charged.set(key, buyResult(key));
      return new Response(JSON.stringify({ order: charged.get(key) }));
    }
    if (u.endsWith("/orders")) return new Response(JSON.stringify({ orders: history }));
    const id = Number(u.split("/").pop());
    return new Response(JSON.stringify({ order: detail[id] }));
  }) as unknown as typeof fetch;
  return { posts, charged };
}
const fresh = (key: string) => ({ order_id: 8000, product_id: 46, quantity: 1, idempotency_key: key, status: "completed", codes: ["NEW-ACCOUNT"] });

test("first purchase already delivered: retry returns it without buying", async () => {
  const s = fakeSupplier([done], { 6922: done }, fresh);
  expect(await insightRetryDelivery(supplier, "46", 1, "order-1", "original-key")).toEqual({ code: "6922", items: ["ACCOUNT"] });
  expect(s.posts).toHaveLength(0);
});
test("first purchase failed: retry buys once with the order's fixed key", async () => {
  const failed = { ...done, status: "failed", codes: [] };
  const s = fakeSupplier([failed], { 6922: failed }, fresh);
  expect((await insightRetryDelivery(supplier, "46", 1, "order-1", "original-key")).items).toEqual(["NEW-ACCOUNT"]);
  expect(s.posts).toEqual(["qorix-retry-order-1"]);
});
test("old order without a saved reference can be retried", async () => {
  const s = fakeSupplier([], {}, fresh);
  expect((await insightRetryDelivery(supplier, "46", 1, "order-1")).items).toEqual(["NEW-ACCOUNT"]);
  expect(s.posts).toEqual(["qorix-retry-order-1"]);
});
test("pressing Retry many times charges the supplier only once", async () => {
  const s = fakeSupplier([], {}, fresh);
  for (let i = 0; i < 3; i++) await insightRetryDelivery(supplier, "46", 1, "order-1");
  expect(new Set(s.posts)).toEqual(new Set(["qorix-retry-order-1"]));
  expect(s.charged.size).toBe(1);
});
test("first purchase still processing: no new purchase", async () => {
  const pending = { ...done, status: "processing", codes: [] };
  const s = fakeSupplier([pending], { 6922: pending }, fresh);
  await expect(insightRetryDelivery(supplier, "46", 1, "order-1", "original-key")).rejects.toThrow("still processing");
  expect(s.posts).toHaveLength(0);
});
