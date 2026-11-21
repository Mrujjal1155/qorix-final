import { expect, mock, test } from "bun:test";
let prepared = 0;
mock.module("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (handler: unknown) => handler };
  return chain;
} }));
mock.module("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
mock.module("@/lib/website-premium-icons.server", () => ({ prepareWebsiteIconRows: async (values: Record<string, string>) => { prepared++; return Object.entries(values).map(([key, value]) => ({ key, value })); } }));
const { saveWebsitePremiumIcons } = await import("../../src/lib/website-premium-icons.functions");
type Row = { key: string; value: string };
type Handler = (input: { context: { userId: string; supabase: { rpc: () => Promise<{ data: boolean; error: Error | null }>; from: (table: string) => { upsert: (rows: Row[]) => Promise<{ error: null }> } } }; data: { values: Record<string, string> } }) => Promise<unknown>;
const save = saveWebsitePremiumIcons as unknown as Handler;
function context(admin: boolean, saved: Row[], roleError: Error | null = null) {
  return { userId: "admin-id", supabase: { rpc: async () => ({ data: admin, error: roleError }), from: (table: string) => { expect(table).toBe("bot_settings"); return { upsert: async (rows: Row[]) => { saved.push(...rows); return { error: null }; } }; } } };
}
test("non-admin cannot resolve artwork or save website icons", async () => {
  const before = prepared;
  const rows: Row[] = [];
  await expect(save({ context: context(false, rows), data: { values: { site_web_icon_connect_button: "5400280896311944960" } } })).rejects.toThrow("Forbidden");
  expect(prepared).toBe(before);
  expect(rows).toHaveLength(0);
});
test("failed role verification cannot save settings", async () => {
  const rows: Row[] = [];
  await expect(save({ context: context(true, rows, new Error("role check failed")), data: { values: { site_web_icon_connect_button: "" } } })).rejects.toThrow("Forbidden");
  expect(rows).toHaveLength(0);
});
test("verified admin saves only requested website keys, including default reset", async () => {
  const rows: Row[] = [];
  await save({ context: context(true, rows), data: { values: { site_web_icon_connect_heading: "5400280896311944960", site_web_icon_main_menu: "" } } });
  expect(rows).toEqual([{ key: "site_web_icon_connect_heading", value: "5400280896311944960" }, { key: "site_web_icon_main_menu", value: "" }]);
});