import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanTiers } from "@/lib/bulk-discount";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listBulkDiscounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const [{ data: rules }, { data: products }] = await Promise.all([
      sb.from("bulk_discounts").select("*").order("created_at", { ascending: false }),
      sb.from("products").select("id,name,price,is_active").is("owner_reseller_id", null).order("sort_order"),
    ]);
    return { rules: (rules ?? []) as any[], products: (products ?? []) as any[] };
  });

const tierSchema = z.object({ min_qty: z.number().int().min(1).max(10000), type: z.enum(["percent", "flat"]), value: z.number().min(0).max(100000) });

export const saveBulkDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().max(120),
        product_ids: z.array(z.string().uuid()).min(1).max(500),
        channel: z.enum(["bot", "api", "both"]),
        tiers: z.array(tierSchema).min(1).max(10),
        is_active: z.boolean(),
        notify: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = (context as any).supabase;
    const tiers = cleanTiers(data.tiers);
    if (!tiers.length) throw new Error("At least one valid tier is required");
    const row = { name: data.name, product_ids: data.product_ids, channel: data.channel, tiers, is_active: data.is_active };
    const q = data.id ? sb.from("bulk_discounts").update(row).eq("id", data.id) : sb.from("bulk_discounts").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);

    let announced = 0;
    if (data.notify && data.is_active) {
      const { data: prods } = await sb.from("products").select("*").in("id", data.product_ids).eq("is_active", true);
      const { announceBulkDiscount } = await import("@/lib/bot/engine.server");
      for (const p of prods ?? []) {
        await announceBulkDiscount(p, data.channel, tiers);
        announced++;
      }
    }
    return { ok: true, announced };
  });

export const deleteBulkDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (context as any).supabase.from("bulk_discounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
