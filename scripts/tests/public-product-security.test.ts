import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env["VITE_SUPABASE_URL"];
const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
if (!url || !key) throw new Error("Public Supabase configuration is required for security tests");
const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

describe("Anonymous supplier privacy", () => {
  test("raw product supplier IDs and costs cannot be read", async () => {
    const { data, error } = await anon.from("products").select("id,supplier_id,supplier_external_id,cost_price").limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
  test("supplier credentials and endpoints cannot be read", async () => {
    const { data, error } = await anon.from("suppliers").select("id,api_key,base_url").limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
  test("the server-only public projection cannot be queried directly", async () => {
    const { error } = await anon.from("public_products").select("id").limit(1);
    expect(error?.code).toBe("42501");
  });
  test("the projection function cannot bypass the server-only boundary", async () => {
    const { error } = await anon.rpc("read_public_products");
    expect(error?.code).toBe("42501");
  });
  test("customer history RPC cannot be called anonymously with a forged owner", async () => {
    const { error } = await anon.rpc("read_customer_orders", { _user_id: "00000000-0000-0000-0000-000000000001", _email: "attacker@example.invalid" });
    expect(error?.code).toBe("42501");
  });
  test("order diagnostics cannot be read anonymously", async () => {
    const { data, error } = await anon.from("orders").select("meta").limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});