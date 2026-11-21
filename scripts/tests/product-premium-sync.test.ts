import { beforeEach, expect, mock, test } from "bun:test";
type Product = { id: string; telegram_custom_emoji_id: string | null; is_active: boolean; owner_reseller_id: string | null; supplier_id?: string };
const products = new Map<string, Product>();
const settings = new Map<string, string>();
const files = new Set<string>();
let downloads = 0, fail = false, changeDuringDownload = false;
const emojiId = "5400280896311944960";
mock.module("@/lib/website-premium-icons.server", () => ({ downloadWebsiteEmoji: async () => {
  downloads++;
  if (fail) throw new Error("unavailable");
  if (changeDuringDownload) { const p = products.get("house"); if (p) p.telegram_custom_emoji_id = "5215361191051798408"; }
  await new Promise(resolve => setTimeout(resolve, 5));
  return { extension: "webp", kind: "image", contentType: "image/webp", bytes: new Uint8Array([1]) };
} }));
function from(table: string) {
  const filters: [string, unknown][] = [];
  let operation = "read", payload: { key?: string; value?: string } = {}, max = Infinity, after = "";
  const chain = {
    select: () => chain, order: () => chain, not: () => chain,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
    gt: (_: string, value: string) => { after = value; return chain; },
    limit: (n: number) => { max = n; return chain; },
    upsert: (value: typeof payload) => { operation = "upsert"; payload = value; return chain; },
    update: (value: typeof payload) => { operation = "update"; payload = value; return chain; },
    maybeSingle: async () => { const result = await run(); return { ...result, data: result.data[0] ?? null }; },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => run().then(resolve, reject),
  };
  async function run() {
    if (table === "products") return { data: [...products.values()].filter(p => p.id > after && filters.every(([k,v]) => p[k as keyof Product] === v)).sort((a,b) => a.id.localeCompare(b.id)).slice(0,max), error: null };
    if (operation === "upsert" && payload.key !== undefined) settings.set(payload.key, payload.value ?? "");
    if (operation === "update") for (const [key,value] of settings) {
      if (filters.every(([k,v]) => (k === "key" ? key : value) === v)) settings.set(key, payload.value ?? "");
    }
    return { data: [...settings].map(([key,value]) => ({key,value})).filter(p => filters.every(([k,v]) => p[k as keyof typeof p] === v)), error: null };
  }
  return chain;
}
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from, storage: { from: () => ({
  list: async (_: string, options: { search: string }) => ({ data: [...files].filter(name => name.startsWith(options.search)).map(name => ({ name })), error: null }),
  upload: async (path: string) => { files.add(path.replace("website-premium/", "")); return { error: null }; },
}) } } }));
const { syncProductPremiumIcon, reconcileProductPremiumIcons } = await import("../../src/lib/product-premium-sync.server");
beforeEach(() => {
  products.clear(); settings.clear(); files.clear(); downloads = 0; fail = false; changeDuringDownload = false;
  process.env["SB_URL"] = "https://example.supabase.co";
  products.set("house", { id: "house", telegram_custom_emoji_id: emojiId, is_active: true, owner_reseller_id: null });
  products.set("supplier", { id: "supplier", telegram_custom_emoji_id: emojiId, is_active: true, owner_reseller_id: null, supplier_id: "private-provider" });
});
test("new in-house and supplier products share safely stored emoji artwork", async () => {
  await Promise.all([syncProductPremiumIcon("house"), syncProductPremiumIcon("supplier")]);
  expect(downloads).toBe(1);
  for (const id of ["house", "supplier"]) {
    const raw = settings.get(`site_product_icon_${id}`) ?? "";
    expect(JSON.parse(raw).emojiId).toBe(emojiId);
    expect(raw).not.toContain("private-provider");
    expect(raw).not.toContain("api.telegram.org");
  }
});
test("already saved emoji is not repeatedly downloaded", async () => {
  await syncProductPremiumIcon("house"); await syncProductPremiumIcon("house");
  expect(downloads).toBe(1);
});
test("emoji removal suppresses obsolete captured artwork", async () => {
  await syncProductPremiumIcon("house");
  const p = products.get("house"); if (p) p.telegram_custom_emoji_id = null;
  await syncProductPremiumIcon("house");
  expect(settings.get("site_product_icon_house")).toBe("");
});
test("failed preparation remains pending and succeeds on retry", async () => {
  fail = true; await expect(syncProductPremiumIcon("house")).rejects.toThrow("unavailable");
  expect(JSON.parse(settings.get("site_product_icon_house") ?? "{}")).toEqual({ emojiId });
  fail = false; await syncProductPremiumIcon("house");
  expect(JSON.parse(settings.get("site_product_icon_house") ?? "{}").kind).toBe("image");
});
test("an in-flight old download cannot publish after the emoji is changed", async () => {
  changeDuringDownload = true; await syncProductPremiumIcon("house");
  expect(JSON.parse(settings.get("site_product_icon_house") ?? "{}")).toEqual({ emojiId });
});
test("private reseller-owned products publish no premium artwork", async () => {
  const p = products.get("house"); if (p) p.owner_reseller_id = "reseller";
  await syncProductPremiumIcon("house"); expect(downloads).toBe(0);
  expect(settings.get("site_product_icon_house")).toBe("");
});
test("scheduled backfill is bounded and durably checkpoints progress", async () => {
  for (let i=0;i<10;i++) products.set(`new-${i}`, { id: `new-${i}`, telegram_custom_emoji_id: emojiId, is_active: true, owner_reseller_id: null });
  const result = await reconcileProductPremiumIcons();
  expect(result.scanned).toBe(8); expect(settings.get("product_premium_scan_cursor")).toBe("new-6");
  const next = await reconcileProductPremiumIcons(); expect(next.scanned).toBe(4);
  await reconcileProductPremiumIcons(); expect(settings.get("product_premium_scan_cursor")).toBe("");
});