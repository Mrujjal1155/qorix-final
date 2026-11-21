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
test("legacy uncertain Insight order cannot be bought again without its original reference", async () => {
  order = { id: "fixture-order", status: "pending", product_id: "product", meta: { paid: true, supplier_error: "delivery needs review" } };
  globalThis.fetch = mock(async () => { purchases++; throw new Error("Unexpected purchase"); }) as unknown as typeof fetch;
  expect(await retrySupplierDelivery(order.id)).toEqual({ ok: false, reason: "Previous Insight Store purchase has no saved reference; reconcile it before retrying" });
  expect(purchases).toBe(0);
});
test("failed reference save prevents the initial supplier purchase", async () => {
  order = { id: "fixture-order", status: "pending", product_id: "product", meta: { paid: true } };
  failSave = true;
  globalThis.fetch = mock(async () => { purchases++; throw new Error("Unexpected purchase"); }) as unknown as typeof fetch;
  expect((await retrySupplierDelivery(order.id)).ok).toBe(false);
  expect(purchases).toBe(0);
});
test("paid retry reuses the original key and reads completed delivery back from the order", async () => {
  order = { id: "fixture-order", status: "pending", product_id: "product", quantity: 1, meta: { paid: true, insight_reference: "original-key", supplier_error: "previous uncertain result" } };
  globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") {
      purchases++;
      expect(JSON.parse(String(init.body)).idempotency_key).toBe("original-key");
      return new Response(JSON.stringify({ order: { order_id: 7000, product_id: 46, quantity: 1, status: "completed", codes: ["ACCOUNT\nPASSWORD"] } }));
    }
    return new Response(JSON.stringify({ balance_usdt: 100 }));
  }) as unknown as typeof fetch;
  expect(await retrySupplierDelivery(order.id)).toEqual({ ok: true, items: ["ACCOUNT\nPASSWORD"] });
  expect(order.status).toBe("completed");
  expect(order.delivered_content).toBe("ACCOUNT\nPASSWORD");
  expect(order.meta.insight_reference).toBe("original-key");
  expect(order.meta.supplier_error).toBeUndefined();
  expect(purchases).toBe(1);
});
test("post-purchase save failure is not reported as completed and keeps the original reference", async () => {
  order = { id: "fixture-order", status: "pending", product_id: "product", quantity: 1, meta: { paid: true, insight_reference: "original-key" } };
  failSave = true;
  globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") {
      purchases++;
      return new Response(JSON.stringify({ order: { order_id: 7000, product_id: 46, quantity: 1, status: "completed", codes: ["ACCOUNT"] } }));
    }
    return new Response(JSON.stringify({ balance_usdt: 100 }));
  }) as unknown as typeof fetch;
  expect((await retrySupplierDelivery(order.id)).ok).toBe(false);
  expect(order.status).toBe("pending");
  expect(order.meta.insight_reference).toBe("original-key");
  expect(purchases).toBe(1);
});