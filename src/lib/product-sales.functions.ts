import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Completed sales of one product (admin only, read-only). */
export const getProductSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string }) => {
    if (!d || typeof d.productId !== "string" || !/^[0-9a-f-]{36}$/i.test(d.productId)) throw new Error("Invalid product");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: (context as any).userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: rows, error } = await sb
      .from("orders")
      .select("order_no, created_at, quantity, unit_price, total, source, reseller_id")
      .eq("product_id", data.productId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error("Could not load sales");
    return { rows: (rows ?? []) as Array<{ order_no: number; created_at: string; quantity: number; unit_price: number; total: number; source: string | null; reseller_id: string | null }> };
  });
