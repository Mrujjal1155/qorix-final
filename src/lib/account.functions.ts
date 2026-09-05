import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ORDER_COLUMNS =
  "order_no,product_name,quantity,unit_price,total,status,delivery_type,delivered_content,payment_method,txid,created_at";

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = String((context.claims as any)?.email ?? "");

    const [{ data: profile }, { data: orders }] = await Promise.all([
      context.supabase.from("profiles").select("full_name,email,created_at").eq("id", context.userId).maybeSingle(),
      context.supabase.from("orders").select(ORDER_COLUMNS).order("created_at", { ascending: false }).limit(200),
    ]);

    const rows = orders ?? [];
    const completed = rows.filter((o: any) => o.status === "completed");
    return {
      email,
      profile: { full_name: profile?.full_name ?? "", created_at: profile?.created_at ?? null },
      orders: rows,
      stats: {
        totalOrders: rows.length,
        completed: completed.length,
        pending: rows.filter((o: any) => o.status === "pending").length,
        spent: completed.reduce((sum: number, o: any) => sum + Number(o.total ?? 0), 0),
      },
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { full_name: string }) => {
    const name = String(d.full_name ?? "").trim().slice(0, 80);
    if (name.length < 2) throw new Error("Name must be at least 2 characters");
    return { full_name: name };
  })
  .handler(async ({ context, data }) => {
    const email = String((context.claims as any)?.email ?? "");
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ id: context.userId, full_name: data.full_name, email }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Attach past guest checkouts (same email) to the signed-in account. */
export const linkMyOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = String((context.claims as any)?.email ?? "").toLowerCase();
    if (!email) return { linked: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("orders")
      .update({ user_id: context.userId })
      .is("user_id", null)
      .eq("source", "website")
      .ilike("customer_email", email)
      .select("id");
    return { linked: (data ?? []).length };
  });
