import { beforeEach, expect, mock, test } from "bun:test";

let botRow: { id: string } | null = { id: "deposit-2360" };
const botCalls: unknown[][] = [];
const websiteCalls: unknown[][] = [];
const filters: unknown[][] = [];
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => {
    const query = { select: () => query, eq: (...args: unknown[]) => { filters.push(args); return query; },
      maybeSingle: async () => ({ data: botRow, error: null }) };
    return query;
  },
} }));
mock.module("@/lib/bot/engine.server", () => ({ settleEpsBotPayment: async (...args: unknown[]) => {
  botCalls.push(args); return { ok: true }; } }));
mock.module("@/lib/eps-settle.server", () => ({ settleEpsPayment: async (...args: unknown[]) => {
  websiteCalls.push(args); return { ok: true, orderNo: 999 }; }, epsSettings: async () => ({}) }));
const { dispatchEpsPayment } = await import("../../src/lib/eps-dispatch.server");
beforeEach(() => { botRow = { id: "deposit-2360" }; botCalls.length = 0; websiteCalls.length = 0; filters.length = 0; });
test("EPS bot IPN reaches its linked bot checkout, not website settlement", async () => {
  expect((await dispatchEpsPayment("202610240733487579", "902e0fe8-2377-49e1-bd8a-6f68cc3b7c09")).ok).toBe(true);
  expect(botCalls).toEqual([["deposit-2360", "202610240733487579", "902e0fe8-2377-49e1-bd8a-6f68cc3b7c09"]]);
  expect(websiteCalls).toHaveLength(0);
});
test("website IPN still reaches the existing verified website settlement", async () => {
  botRow = null;
  await dispatchEpsPayment("website-mtid", "website-etid");
  expect(websiteCalls).toEqual([["website-mtid", "website-etid"]]);
  expect(botCalls).toHaveLength(0);
});
test("EPS transaction-only callback locates the stored bot gateway ID", async () => {
  await dispatchEpsPayment("", "gateway-id");
  expect(filters).toContainEqual(["meta->>eps_tid", "gateway-id"]);
  expect(botCalls).toEqual([["deposit-2360", null, "gateway-id"]]);
});
test("missing callback IDs cannot enter either settlement path", async () => {
  expect((await dispatchEpsPayment("", null)).ok).toBe(false);
  expect(botCalls).toHaveLength(0);
  expect(websiteCalls).toHaveLength(0);
});