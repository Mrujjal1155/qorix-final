import { beforeEach, expect, mock, test } from "bun:test";
import { stockExportInput, stockDeleteInput, stockExportText } from "../../src/lib/stock-extraction";

const calls: { name: string; args: Record<string, unknown> }[] = [];
let rpcError: { message: string } | null = null;
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    return { data: { deleted: 4 }, error: rpcError };
  } },
}));
const { runStockExtraction } = await import("../../src/lib/stock-extraction.server");
const context = (admin: boolean, error: unknown = null) => ({ userId: "verified-admin", supabase: { rpc: async () => ({ data: admin, error }) } });
beforeEach(() => { calls.length = 0; rpcError = null; });

test("export preserves stored account format and full Mail Check URL", () => {
  const content = "Email: sample@example.test\nPassword: sample-password\nMail Check: https://example.test/read?uuid=full-id";
  expect(stockExportText([{ id: "a", content }, { id: "b", content: "second account" }])).toBe(`${content}\n\nsecond account`);
});
test("quantity must be a positive whole number", () => {
  for (const quantity of [0, -1, 1.5]) expect(stockExportInput.safeParse({ product_id: "bf28fb67-2123-4bcf-902b-4e2bd2050212", quantity }).success).toBe(false);
  expect(stockExportInput.parse({ product_id: "bf28fb67-2123-4bcf-902b-4e2bd2050212", quantity: 4 }).quantity).toBe(4);
});
test("non-admin cannot export any accounts", async () => {
  await expect(runStockExtraction(context(false), "export", { _quantity: 4 })).rejects.toThrow("Forbidden");
  expect(calls.length).toBe(0);
});
test("non-admin cannot permanently delete accounts", async () => {
  await expect(runStockExtraction(context(false), "delete", { _export_id: "receipt" })).rejects.toThrow("Forbidden");
  expect(calls.length).toBe(0);
});
test("failed role verification is denied even with a truthy result", async () => {
  await expect(runStockExtraction(context(true, { message: "failed" }), "export", {})).rejects.toThrow("Forbidden");
  expect(calls.length).toBe(0);
});
test("export and deletion derive ownership from the verified caller", async () => {
  await runStockExtraction(context(true), "export", { _product_id: "product", _quantity: 4, _admin_user_id: "forged-owner" });
  await runStockExtraction(context(true), "delete", { _export_id: "receipt", _admin_user_id: "forged-owner" });
  expect(calls).toEqual([
    { name: "admin_export_unsold_stock", args: { _product_id: "product", _quantity: 4, _admin_user_id: "verified-admin" } },
    { name: "admin_delete_exported_stock", args: { _export_id: "receipt", _admin_user_id: "verified-admin" } },
  ]);
});
test("delete input ignores caller-supplied replacement stock IDs", () => {
  expect(stockDeleteInput.parse({ export_id: "bf28fb67-2123-4bcf-902b-4e2bd2050212", stock_ids: ["unexported"] })).toEqual({ export_id: "bf28fb67-2123-4bcf-902b-4e2bd2050212" });
});
test("a sold or changed export reports no deletion and permits a fresh export", async () => {
  rpcError = { message: "An exported account was sold, removed or is being processed. Nothing was deleted. Export again." };
  await expect(runStockExtraction(context(true), "delete", { _export_id: "receipt" })).rejects.toThrow("Nothing was deleted");
});
test("internal database errors do not leak", async () => {
  rpcError = { message: "private database diagnostic" };
  await expect(runStockExtraction(context(true), "export", {})).rejects.toThrow("Stock operation failed. Refresh and try again.");
});