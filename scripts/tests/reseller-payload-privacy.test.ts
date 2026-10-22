import { beforeEach, describe, expect, mock, test } from "bun:test";

const privateError = "private supplier endpoint https://private.example.invalid/api token=secret-marker";
let stockFails = false;
let debitFails = false;
const product = {
  id: "product", name: "Digital subscription", description: "Original description",
  image_url: "https://images.example.invalid/product.png", quick_guide: "Original guide",
  price: 10, delivery_type: "auto", is_active: true, supplier_id: null,
  supplier_external_id: "private-external", cost_price: 7, api_key: "private-key",
};
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      let inserting = false;
      const query: any = {
        select: () => query, eq: () => query, or: () => query, order: () => query,
        in: () => query, neq: () => query, gte: () => query, is: () => query,
        limit: () => query, delete: () => query,
        insert: () => { inserting = true; return query; },
        maybeSingle: async () => ({ data: table === "products" ? product : inserting ? { id: "reserved", created_at: "2026-10-22" } : null, error: null }),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve({ data: table === "products" ? [product] : [], error: null }));
        },
      };
      return query;
    },
    rpc: async (name: string) => name === "stock_counts"
      ? { data: [{ product_id: product.id, available: 3 }], error: stockFails ? { message: privateError } : null }
      : { data: null, error: debitFails ? { message: privateError } : null },
  },
}));
mock.module("@/lib/bulk-discount.server", () => ({ bulkTiersFor: async () => ({}), bulkUnit: (_p: unknown, unit: number) => unit }));
const { publicProduct, catalogue, singleProduct, purchase } = await import("../../src/lib/reseller/core.server");
const reseller = { id: "reseller", name: "Shop", balance: 100, discount_percent: 0, is_active: true, allow_website: true, allow_bot: true };
beforeEach(() => { stockFails = false; debitFails = false; });

describe("Reseller supplier payload privacy", () => {
  test("supplier identifiers, cost and credentials stay internal while product content is unchanged", () => {
    const out = publicProduct({ ...product, supplier_id: "private-supplier", supplier_stock: 8 }, reseller, {});
    for (const key of ["supplier_id", "supplier_external_id", "cost_price", "api_key", "base_url"]) expect(out).not.toHaveProperty(key);
    expect(out.description).toBe(product.description);
    expect(out.image_url).toBe(product.image_url);
    expect(out.quick_guide).toBe(product.quick_guide);
    expect(out.stock).toBe(8);
    expect(out.price).toBe(10);
  });
  test("catalogue stock failure cannot expose raw private diagnostics", async () => {
    stockFails = true;
    await expect(catalogue(reseller, "website")).rejects.toThrow("Product stock is temporarily unavailable");
    try { await catalogue(reseller, "website"); } catch (error) { expect(String(error)).not.toContain(privateError); }
  });
  test("single-product stock failure cannot expose raw private diagnostics", async () => {
    stockFails = true;
    await expect(singleProduct(reseller, product.id)).rejects.toThrow("Product stock is temporarily unavailable");
    try { await singleProduct(reseller, product.id); } catch (error) { expect(String(error)).not.toContain(privateError); }
  });
  test("failed balance debit returns no raw database or supplier error", async () => {
    debitFails = true;
    const result = await purchase(reseller, { product_id: product.id, quantity: 1, channel: "website" });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 402, error: "Unable to process balance. Please check your balance and try again." });
    expect(JSON.stringify(result)).not.toContain(privateError);
  });
});