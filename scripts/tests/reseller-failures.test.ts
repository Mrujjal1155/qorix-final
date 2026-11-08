import { beforeEach, expect, mock, test } from "bun:test";

const reseller = { id: "reseller", name: "Shop", balance: 100, discount_percent: 0, is_active: true, allow_website: true, allow_bot: true };
const orderId = "11111111-1111-4111-8111-111111111111";
const privateReason = "private supplier wallet empty";
let product: any;
let order: any;
let balance = 100;
let debitFails = false;
let refundFails = false;
let saveFails = false;
let manualStock = false;
let stockResult = "out_of_stock";
let available = 10;
let deleted = 0;
let supplierCalls = 0;
let supplierSuccess = false;
let ledger: any[] = [];

mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    const filters: [string, any][] = [];
    let operation = "select";
    let values: any;
    const execute = () => {
      let row = table === "products" ? product : table === "orders" ? order : table === "resellers" ? { ...reseller, balance } : table === "suppliers" ? { id: "supplier", is_enabled: true } : null;
      if (operation === "insert") { order = { ...values, id: orderId, order_no: 123, created_at: new Date().toISOString(), meta: { ...values.meta } }; row = order; }
      else if (table === "orders" && operation === "update" && order) {
        if (saveFails && values.meta?.refunded) return { data: null, error: { message: "status save interrupted" } };
        Object.assign(order, values); row = order;
      }
      else if (operation === "delete") { deleted++; order = null; row = null; }
      else if (filters.some(([key, value]) => row?.[key] !== value)) row = null;
      return { data: row, error: null };
    };
    const query: any = {
      select: () => query, eq: (key: string, value: any) => { if (key !== "api_key") filters.push([key, value]); return query; },
      or: () => query, is: () => query, ilike: () => query, neq: () => query, gte: () => query, in: () => query,
      order: () => query, limit: () => query,
      insert: (value: any) => { operation = "insert"; values = value; return query; },
      update: (value: any) => { operation = "update"; values = value; return query; },
      delete: () => { operation = "delete"; return query; },
      maybeSingle: async () => execute(), single: async () => execute(),
      then: (resolve: any, reject: any) => Promise.resolve(table === "orders" && operation === "select" ? { data: [], error: null } : execute()).then(resolve, reject),
    };
    return query;
  },
  async rpc(name: string, args: any) {
    if (name === "stock_counts") return { data: [{ available }], error: null };
    if (name === "debit_reseller_order") {
      if (debitFails) { balance = 2; return { data: { status: "insufficient_balance" }, error: null }; }
      balance -= order.total; ledger.push({ _type: "order", _amount: -order.total });
      order.meta = { ...order.meta, paid: true, debit_amount: order.total };
      return { data: { status: "debited", balance }, error: null };
    }
    if (name === "refund_failed_reseller_order") {
      if (refundFails || saveFails) return { data: null, error: { message: "atomic transaction failed" } };
      if (order.meta.refunded) return { data: { status: "already_refunded" }, error: null };
      if (order.status !== "pending") return { data: { status: "ineligible" }, error: null };
      balance += order.total; ledger.push({ _type: "refund", _amount: order.total });
      order.status = "failed"; order.delivered_content = null;
      order.meta = { ...order.meta, refunded: true, refund_amount: order.total, ...(args._supplier_error ? { supplier_failed: true, supplier_error: args._supplier_error } : {}) };
      return { data: { status: "refunded" }, error: null };
    }
    if (name === "take_manual_stock") return { data: manualStock, error: null };
    if (name === "reseller_adjust_balance") {
      if (args._amount < 0 && debitFails) { balance = 2; return { data: null, error: { message: "private diagnostic" } }; }
      if (args._type === "refund" && refundFails) return { data: null, error: { message: "private diagnostic" } };
      balance += args._amount;
      ledger.push({ ...args });
      return { data: balance, error: null };
    }
    return { data: [], error: null };
  },
} }));
mock.module("@/lib/bulk-discount.server", () => ({ bulkTiersFor: async () => ({}), bulkUnit: (_p: any, unit: number) => unit }));
mock.module("@/lib/reseller/charged-stock.server", () => ({ fulfillChargedResellerStock: async () => ({ status: stockResult }) }));
mock.module("@/lib/suppliers/api.server", () => ({ supplierOrder: async () => { supplierCalls++; if (supplierSuccess) return { items: ["account:password"] }; throw Object.assign(new Error(privateReason), { deliveryOutcome: "rejected" }); } }));
mock.module("@/lib/suppliers/fulfil.server", () => ({ supplierUnitCost: async () => null, supplierPreflight: async () => ({ ok: true }) }));
mock.module("@/lib/bot/engine.server", () => ({ checkResellerLowBalance: async () => {}, notifyAdmins: async () => {}, announceOrderSale: async () => {} }));
mock.module("@/lib/bg.server", () => ({ backgroundWaitUntil: () => false }));
mock.module("@tanstack/react-router", () => ({ createFileRoute: () => (options: any) => options }));
const core = await import("../../src/lib/reseller/core.server");
const { Route: postRoute } = await import("../../src/routes/api/public/reseller/v1/orders");
const { Route: getRoute } = await import("../../src/routes/api/public/reseller/v1/orders.$id");
const input = { product_id: "product", quantity: 1, channel: "website" as const, external_ref: "test-order" };
const deliveryFailure = { ok: false, code: "delivery_failed", refunded: true, error: "Delivery failed — please try again later." };

beforeEach(() => {
  product = { id: "product", name: "Subscription", price: 10, delivery_type: "auto", is_active: true, supplier_id: null, supplier_external_id: null, supplier_stock: 10 };
  order = null; available = 10; balance = 100; debitFails = false; refundFails = false; saveFails = false; manualStock = false; stockResult = "out_of_stock"; deleted = 0; supplierCalls = 0; supplierSuccess = false; ledger = [];
});

async function post() {
  return (postRoute as any).server.handlers.POST({ request: new Request("http://localhost/api/public/reseller/v1/orders", { method: "POST", headers: { authorization: "Bearer test-key", "content-type": "application/json" }, body: JSON.stringify(input) }) });
}

test("in-house confirmed shortage returns the exact HTTP 409 failure and one refund", async () => {
  const response = await post();
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual(deliveryFailure);
  expect(balance).toBe(100);
  expect(ledger.map(t => [t._type, t._amount])).toEqual([["order", -10], ["refund", 10]]);
  expect(deleted).toBe(0);
});

test("terminal failed refunded order reads back through actual GET handler by UUID, order_no and external_ref", async () => {
  await post();
  for (const id of [orderId, "123", "test-order"]) {
    const response = await (getRoute as any).server.handlers.GET({ request: new Request("http://localhost/api/public/reseller/v1/orders/" + id, { headers: { authorization: "Bearer test-key" } }), params: { id } });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.order).toMatchObject({ id: orderId, status: "failed", items: [], refunded: true });
    expect(result.order).not.toHaveProperty("meta");
  }
});

test("limited manual shortage uses the same HTTP 409 shape and keeps its order", async () => {
  product.delivery_type = "manual"; product.manual_stock_limited = true;
  const response = await post();
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual(deliveryFailure);
  expect(order.status).toBe("failed");
  expect(order.meta.refunded).toBe(true);
  expect(balance).toBe(100);
  expect(deleted).toBe(0);
});

test("replaying a refunded external_ref never debits or refunds again", async () => {
  await core.purchase(reseller, input);
  const result = await core.purchase(reseller, input);
  expect(result).toMatchObject({ ok: true, duplicate: true, order: { status: "failed", refunded: true, items: [] } });
  expect(ledger.length).toBe(2);
  expect(balance).toBe(100);
});

test("debit race returns HTTP 402 with fresh balance and required without deleting the order", async () => {
  debitFails = true;
  const response = await post();
  expect(response.status).toBe(402);
  expect(await response.json()).toMatchObject({ ok: false, balance: 2, required: 10 });
  expect(order.status).toBe("cancelled");
  expect(ledger.length).toBe(0);
  expect(deleted).toBe(0);
});

test("unconfirmed refund never falsely reports refunded true and retains the order", async () => {
  refundFails = true;
  const response = await post();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false, error: "Delivery status could not be confirmed — please contact support." });
  expect(deleted).toBe(0);
  expect(ledger.length).toBe(1);
});

test("genuine manual processing keeps its successful paid pending behaviour", async () => {
  product.delivery_type = "manual";
  const result = await core.purchase(reseller, input);
  expect(result).toMatchObject({ ok: true, balance: 90, order: { status: "pending", items: [] } });
  expect(ledger.map(t => t._type)).toEqual(["order"]);
});

test("atomic refund failure cannot credit without saving terminal state", async () => {
  saveFails = true;
  const response = await post();
  expect(response.status).toBe(503);
  expect(balance).toBe(90);
  expect(order.status).toBe("pending");
  expect(ledger.map(t => t._type)).toEqual(["order"]);
});

test("supplier rejection after debit refunds once and retains private diagnostics", async () => {
  product.supplier_id = "supplier"; product.supplier_external_id = "external";
  const response = await post();
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual(deliveryFailure);
  expect(order.status).toBe("failed");
  expect(order.meta.supplier_error).toBe(privateReason);
  expect(balance).toBe(100);
  expect(ledger.map(t => t._type)).toEqual(["order", "refund"]);
});

test("successful supplier purchase keeps price, delivery and exactly one original debit", async () => {
  supplierSuccess = true; product.supplier_id = "supplier"; product.supplier_external_id = "external";
  const result = await core.purchase(reseller, input);
  expect(result).toMatchObject({ ok: true, balance: 90, order: { status: "completed", items: ["account:password"], unit_price: 10, total: 10 } });
  expect(ledger.map(t => [t._type, t._amount])).toEqual([["order", -10]]);
  expect(deleted).toBe(0);
});
test("insufficient balance pre-check has no reservation, debit or refund", async () => {
  balance = 2;
  const response = await post();
  expect(response.status).toBe(402);
  expect(await response.json()).toEqual({ ok: false, error: "Insufficient balance", balance: 2, required: 10 });
  expect(order).toBeNull(); expect(ledger).toEqual([]);
});
test("zero stock pre-check never debits for own, supplier or limited manual", async () => {
  for (const kind of ["own", "supplier", "manual"]) {
    available = 0; product.supplier_stock = 0;
    product.supplier_id = kind === "supplier" ? "supplier" : null;
    product.delivery_type = kind === "manual" ? "manual" : "auto";
    product.manual_stock_limited = kind === "manual";
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "out_of_stock", error: "Product temporarily unavailable", refunded: false });
    expect(order).toBeNull(); expect(ledger).toEqual([]);
  }
});
test("direct refund path twice changes nothing on the second attempt", async () => {
  await post();
  const { refundResellerDeliveryFailure } = await import("../../src/lib/reseller/failure-refund.server");
  expect(await refundResellerDeliveryFailure(orderId, "out_of_stock")).toMatchObject({ status: 409, refunded: true });
  expect(ledger.filter(t => t._type === "refund")).toHaveLength(1);
  expect(balance).toBe(100);
});
