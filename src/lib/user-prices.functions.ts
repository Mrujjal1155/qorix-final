import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Products + every saved custom price (admin only). */
export const listUserPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const [{ data: products }, { data: rows }] = await Promise.all([
      sb.from("products").select("id,name,price,is_active,delivery_type").is("owner_reseller_id", null).order("sort_order"),
      sb.from("user_product_prices").select("*").order("updated_at", { ascending: false }).limit(1000),
    ]);
    const ids = [...new Set(((rows ?? []) as any[]).map((r) => r.telegram_id))];
    const { data: users } = ids.length
      ? await sb.from("bot_users").select("telegram_id,username,first_name").in("telegram_id", ids)
      : { data: [] };
    return { products: (products ?? []) as any[], rows: (rows ?? []) as any[], users: (users ?? []) as any[] };
  });

/** Search bot users by @username, name or Telegram ID. */
export const searchBotUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const q = data.q.replace(/^@/, "").replace(/[%,()]/g, "");
    let query = sb.from("bot_users").select("telegram_id,username,first_name,last_name").limit(20);
    query = /^\d+$/.test(q)
      ? query.or(`telegram_id.eq.${q},username.ilike.%${q}%`)
      : query.or(`username.ilike.%${q}%,first_name.ilike.%${q}%`);
    const { data: users } = await query;
    return (users ?? []) as any[];
  });

export const saveUserPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        telegram_id: z.number().int(),
        product_id: z.string().uuid(),
        price: z.number().min(0).max(100000),
        min_qty: z.number().int().min(1).max(10000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase
      .from("user_product_prices")
      .upsert(data, { onConflict: "telegram_id,product_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUserPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase.from("user_product_prices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
