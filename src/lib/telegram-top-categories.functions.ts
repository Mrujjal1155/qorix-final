import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TELEGRAM_TOP_CATEGORIES_KEY, parseTopCategories, topCategoriesSchema, type TopCategory } from "@/lib/telegram-top-categories";

export const getTelegramTopCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const { data, error } = await context.supabase.from("bot_settings").select("value").eq("key", TELEGRAM_TOP_CATEGORIES_KEY).maybeSingle();
    if (error) throw new Error("Could not load top categories");
    return { categories: parseTopCategories(data?.value) };
  });

export const saveTelegramTopCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { categories: TopCategory[] }) => ({ categories: topCategoriesSchema.parse(input.categories) }))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("bot_settings").upsert({ key: TELEGRAM_TOP_CATEGORIES_KEY, value: JSON.stringify(data.categories) }, { onConflict: "key" });
    if (error) throw new Error("Could not save top categories");
    return { categories: data.categories };
  });