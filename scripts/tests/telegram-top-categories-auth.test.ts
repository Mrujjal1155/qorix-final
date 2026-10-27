import { expect, mock, test } from "bun:test";
let admin = true;
let stored: string | null = null;
let writes = 0;
const context = { userId: "test-user", supabase: {
  rpc: async () => ({ data: admin, error: null }),
  from: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: stored === null ? null : { value: stored }, error: null }),
      upsert: async (row: { value: string }) => { writes++; stored = row.value; return { error: null }; },
    };
    return chain;
  },
} };
mock.module("@tanstack/react-start", () => ({ createServerFn: () => {
  let validator = (value: unknown) => value;
  const chain = {
    middleware: () => chain,
    inputValidator: (fn: typeof validator) => { validator = fn; return chain; },
    handler: (fn: (args: { data: unknown; context: typeof context }) => Promise<unknown>) => (args?: { data: unknown }) => fn({ data: validator(args?.data), context }),
  };
  return chain;
} }));
mock.module("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const { getTelegramTopCategories, saveTelegramTopCategories } = await import("../../src/lib/telegram-top-categories.functions");

test("admin saves and reads custom top category names and order", async () => {
  const categories = [{ id: "custom", name: "All Lovable Product", keywords: ["lovable"], is_active: true }];
  await saveTelegramTopCategories({ data: { categories } });
  expect(await getTelegramTopCategories()).toEqual({ categories });
  expect(writes).toBe(1);
});
test("non-admin cannot read or change top category configuration", async () => {
  admin = false;
  const before = stored;
  try {
    await expect(getTelegramTopCategories()).rejects.toThrow("Forbidden");
    await expect(saveTelegramTopCategories({ data: { categories: [] } })).rejects.toThrow("Forbidden");
    expect(writes).toBe(1);
    expect(stored).toBe(before);
  } finally { admin = true; }
});