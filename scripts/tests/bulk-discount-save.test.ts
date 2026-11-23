import { beforeEach, expect, mock, test } from "bun:test";

mock.module("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (handler: unknown) => handler };
  return chain;
} }));
mock.module("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
let queued: any[] = [];
mock.module("@/lib/bot/engine.server", () => ({ announceBulkDiscount: async (...args: any[]) => {
  queued.push(args); return { id: "queued-event", total: 1503 };
} }));
const { saveBulkDiscount } = await import("../../src/lib/bulk-discount.functions");
const save = saveBulkDiscount as unknown as (input: { context: any; data: any }) => Promise<any>;
let saved: any[] = [];
let productError = false;
const product = { id: "11111111-1111-4111-8111-111111111111", name: "Selected", price: 1 };
const input = { name: "Bulk", product_ids: [product.id], channel: "api", tiers: [{ min_qty: 5, type: "percent", value: 10 }], is_active: true, notify: false, requestId: "22222222-2222-4222-8222-222222222222" };
function context(admin: boolean) {
  return { userId: "verified-admin", supabase: {
    rpc: async () => ({ data: admin }),
    from: (table: string) => {
      const q: any = {
        insert: (row: any) => { saved.push(row); return q; },
        update: (row: any) => { saved.push(row); return q; },
        select: () => q, in: () => q, eq: () => q,
        then: (resolve: any) => resolve(table === "products" ? { data: [product], error: productError ? { message: "unavailable" } : null } : { error: null }),
      };
      return q;
    },
  } };
}
beforeEach(() => { saved = []; queued = []; productError = false; });
test("admin creates an active API discount and queues the selected product for every bot user", async () => {
  expect(await save({ context: context(true), data: input })).toEqual({ ok: true, announced: 1 });
  expect(saved).toHaveLength(1);
  expect(queued[0]).toEqual([product, "api", input.tiers, "verified-admin", input.requestId]);
});
test("non-admin cannot save a bulk rule or start any broadcast", async () => {
  await expect(save({ context: context(false), data: input })).rejects.toThrow("Forbidden");
  expect(saved).toHaveLength(0); expect(queued).toHaveLength(0);
});
test("normal edits preserve the rule without repeatedly notifying everyone", async () => {
  expect(await save({ context: context(true), data: { ...input, id: "existing" } })).toEqual({ ok: true, announced: 0 });
  expect(queued).toHaveLength(0);
});
test("failure to load products cannot falsely report successful broadcast", async () => {
  productError = true;
  await expect(save({ context: context(true), data: input })).rejects.toThrow("broadcast products could not be loaded");
  expect(queued).toHaveLength(0);
});