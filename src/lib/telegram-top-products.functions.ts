import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TELEGRAM_TOP_PRODUCTS_KEY, parseTopProductIds, selectTopProducts } from "@/lib/telegram-top-products";

export const getTelegramTopProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const { data, error } = await context.supabase.from("bot_settings").select("value").eq("key", TELEGRAM_TOP_PRODUCTS_KEY).maybeSingle();
    if (error) throw new Error("Could not load top products");
    return { product_ids: parseTopProductIds(data?.value) };
  });

export const saveTelegramTopProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { product_ids: string[] }) => z.object({ product_ids: z.array(z.string().uuid()) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const ids = [...new Set(data.product_ids)];
    const catalogue: { id: string; name: string }[] = [];
    // Check in batches so a catalogue larger than PostgREST's cap is still valid.
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const { data: products, error } = await context.supabase.from("products").select("id,name").is("owner_reseller_id", null).in("id", batch);
      if (error || products?.length !== batch.length) throw new Error("Some products are no longer available. Reload and try again.");
      catalogue.push(...(products ?? []));
    }
    const orderedIds = selectTopProducts(catalogue, ids).map((p) => p.id);
    const { error } = await context.supabase.from("bot_settings").upsert({ key: TELEGRAM_TOP_PRODUCTS_KEY, value: JSON.stringify(orderedIds) }, { onConflict: "key" });
    if (error) throw new Error("Could not save top products");
    return { product_ids: orderedIds };
  });
const TOP_CATEGORIES_KEY = "telegram_top_category_ids";

export const getTelegramTopCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const { data, error } = await context.supabase.from("bot_settings").select("value").eq("key", TOP_CATEGORIES_KEY).maybeSingle();
    if (error) throw new Error("Could not load top categories");
    return { saved: data != null, category_ids: parseTopProductIds(data?.value) };
  });

export const saveTelegramTopCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { category_ids: string[] }) => z.object({ category_ids: z.array(z.string().uuid()).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const ids = [...new Set(data.category_ids)];
    if (ids.length) {
      const { data: cats, error } = await context.supabase.from("categories").select("id").in("id", ids);
      if (error || cats?.length !== ids.length) throw new Error("Some categories no longer exist. Reload and try again.");
    }
    const { error } = await context.supabase.from("bot_settings").upsert({ key: TOP_CATEGORIES_KEY, value: JSON.stringify(ids) }, { onConflict: "key" });
    if (error) throw new Error("Could not save top categories");
    return { saved: true, category_ids: ids };
  });

const HIDDEN_CATEGORIES_KEY = "telegram_hidden_category_ids";

export const getTelegramHiddenCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const { data, error } = await context.supabase.from("bot_settings").select("value").eq("key", HIDDEN_CATEGORIES_KEY).maybeSingle();
    if (error) throw new Error("Could not load hidden categories");
    return { saved: data != null, category_ids: parseTopProductIds(data?.value) };
  });

export const saveTelegramHiddenCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { category_ids: string[] }) => z.object({ category_ids: z.array(z.string().uuid()).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const ids = [...new Set(data.category_ids)];
    const { error } = await context.supabase.from("bot_settings").upsert({ key: HIDDEN_CATEGORIES_KEY, value: JSON.stringify(ids) }, { onConflict: "key" });
    if (error) throw new Error("Could not save hidden categories");
    return { saved: true, category_ids: ids };
  });
