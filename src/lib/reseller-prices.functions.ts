import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Products + resellers + every saved reseller custom price (admin only). */
export const listResellerPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const [{ data: products }, { data: rows }, { data: resellers }] = await Promise.all([
      sb.from("products").select("id,name,price,is_active,delivery_type").is("owner_reseller_id", null).order("sort_order"),
      sb.from("reseller_product_prices").select("*").order("updated_at", { ascending: false }).limit(1000),
      sb.from("resellers").select("id,name,email,discount_percent,is_active").order("name"),
    ]);
    return { products: (products ?? []) as any[], rows: (rows ?? []) as any[], resellers: (resellers ?? []) as any[] };
  });

export const saveResellerPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        reseller_id: z.string().uuid(),
        product_id: z.string().uuid(),
        price: z.number().min(0).max(100000),
        min_qty: z.number().int().min(1).max(10000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { saveSpecialPrice } = await import("@/lib/bot/special-price.server");
    return saveSpecialPrice(supabaseAdmin, "reseller", data.reseller_id, data.product_id, data.price, data.min_qty, context.userId);
  });

export const deleteResellerPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase.from("reseller_product_prices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
