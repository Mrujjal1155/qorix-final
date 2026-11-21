import { afterEach, expect, mock, test } from "bun:test";

const supplier = { id: "supplier-fixture", key: "insightstore", name: "Private fixture", base_url: "https://api.insightxpro.store", api_key: "fixture-key", is_enabled: true };
let order: any;
let failSave = false;
let purchases = 0;
const originalFetch = globalThis.fetch;
mock.module("@/lib/suppliers/live-stock.server", () => ({ refreshLiveStock: async () => null }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    let patch: any;
    const q: any = {
      select: () => q, eq: () => q, order: () => q, limit: () => q,
      update: (value: any) => { patch = value; return q; },
      maybeSingle: async () => ({ data: table === "orders" ? order : table === "products" ? { id: "product", supplier_id: supplier.id, supplier_external_id: "46" } : table === "suppliers" ? supplier : { cost_price: 4 } }),
      then: (resolve: (value: unknown) => void) => {
        if (patch && !failSave) order = { ...order, ...patch };
        resolve({ data: null, error: failSave ? { message: "fixture write failed" } : null });
      },
    };
    return q;
  },
} }));
const { retrySupplierDelivery, supplierOrderWithRetry } = await import("../../src/lib/suppliers/fulfil.server");
afterEach(() => { globalThis.fetch = originalFetch; failSave = false; purchases = 0; });

test("shared helper never adds another Insight purchase on HTTP rejection", async () => {
  globalThis.fetch = mock(async () => { purchases++; return new Response(JSON.stringify({ error: "busy" }), { status: 429 }); }) as unknown as typeof fetch;
  await expect(supplierOrderWithRetry(supplier, "46", 1, "stable")).rejects.toThrow();
  expect(purchases).toBe(1);
});
test("legacy Insight order without a reference retries once with a fixed per-order key", async () => {
  order = { id: "fixture-order", status: "pending", product_id: "product", quantity: 1, meta: { paid: true, supplier_error: "delivery needs review" } };
  const keys: string[] = [];
  globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") { purchases++; const key = JSON.parse(String(init.body)).idempotency_key; keys.push(key);
      return new Response(JSON.stringify({ order: { order_id: 7100, idempotency_key: key, product_id: 46, quantity: 1, status: "completed", codes: ["NEW"] } })); }
    return new Response(JSON.stringify({ balance_usdt: 100 }));
  }) as unknown as typeof fetch;
  expect(await retrySupplierDelivery(order.id)).toEqual({ ok: true, items: ["NEW"] });
  expect(keys).toEqual(["qorix-retry-fixture-order"]);
  expect(order.status).toBe("completed");
});
test("paid retry reuses the original key and reads completed delivery back from the order", async () => {
  order = { id: "fixture-order", status: "pending", product_id: "product", quantity: 1, meta: { paid: true, insight_reference: "original-key", supplier_error: "previous uncertain result" } };
  globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") { purchases++; throw new Error("Unexpected purchase"); }
    if (String(_url).endsWith("/orders")) return new Response(JSON.stringify({ orders: [{ order_id: 7000, idempotency_key: "original-key" }] }));
    if (String(_url).endsWith("/orders/7000")) return new Response(JSON.stringify({ order: { order_id: 7000, idempotency_key: "original-key", product_id: 46, quantity: 1, status: "completed", codes: ["ACCOUNT\nPASSWORD"] } }));
    return new Response(JSON.stringify({ balance_usdt: 100 }));
  }) as unknown as typeof fetch;
  expect(await retrySupplierDelivery(order.id)).toEqual({ ok: true, items: ["ACCOUNT\nPASSWORD"] });
  expect(order.status).toBe("completed");
  expect(order.delivered_content).toBe("ACCOUNT\nPASSWORD");
  expect(order.meta.insight_reference).toBe("original-key");
  expect(order.meta.supplier_error).toBeUndefined();
  expect(purchases).toBe(0);
});
test("post-purchase save failure is not reported as completed and keeps the original reference", async () => {
  order = { id: "fixture-order", status: "pending", product_id: "product", quantity: 1, meta: { paid: true, insight_reference: "original-key" } };
  failSave = true;
  globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") { purchases++; throw new Error("Unexpected purchase"); }
    if (String(_url).endsWith("/orders")) return new Response(JSON.stringify({ orders: [{ order_id: 7000, idempotency_key: "original-key" }] }));
    if (String(_url).endsWith("/orders/7000")) return new Response(JSON.stringify({ order: { order_id: 7000, idempotency_key: "original-key", product_id: 46, quantity: 1, status: "completed", codes: ["ACCOUNT"] } }));
    return new Response(JSON.stringify({ balance_usdt: 100 }));
  }) as unknown as typeof fetch;
  expect((await retrySupplierDelivery(order.id)).ok).toBe(false);
  expect(order.status).toBe("pending");
  expect(order.meta.insight_reference).toBe("original-key");
  expect(purchases).toBe(0);
});

test("unpaid Insight retry never retrieves or purchases credentials", async () => {
  order = { id: "fixture-order", status: "pending", product_id: "product", meta: { paid: false, insight_reference: "original-key" } };
  globalThis.fetch = mock(async () => { purchases++; throw new Error("Unexpected request"); }) as unknown as typeof fetch;
  expect((await retrySupplierDelivery(order.id)).ok).toBe(false);
  expect(purchases).toBe(0);
});