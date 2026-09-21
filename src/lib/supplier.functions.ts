import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSupplierAdmin } from "@/lib/suppliers/admin-support";

async function readAllSupplierProducts(sb: any, supplierId?: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = sb.from("supplier_products").select("*").order("name").range(from, from + pageSize - 1);
    if (supplierId) query = query.eq("supplier_id", supplierId);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as any).supabase;
    await assertSupplierAdmin(context);
    const { data, error } = await sb.from("suppliers").select("*").order("created_at");
    if (error) {
      // Migration not applied yet: return empty list instead of crashing the page.
      const missingTable =
        error.code === "PGRST205" ||
        error.code === "42P01" ||
        /schema cache|does not exist/i.test(error.message ?? "");
      if (missingTable) return [] as any[];
      throw new Error(error.message);
    }
    return (data ?? []).map((s: any) => ({ ...s, api_key: s.api_key ? "saved" : null }));
  });

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      key?: string;
      name?: string;
      base_url?: string;
      api_key?: string;
      is_enabled?: boolean;
      markup_percent?: number;
      markup_fixed?: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertSupplierAdmin(context);
    const row: any = {};
    for (const k of ["key", "name", "base_url", "is_enabled", "markup_percent", "markup_fixed"] as const) {
      if (data[k] !== undefined) row[k] = data[k];
    }
    if (data.api_key) row.api_key = data.api_key;
    const q = data.id
      ? sb.from("suppliers").update(row).eq("id", data.id)
      : sb.from("suppliers").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertSupplierAdmin(context);
    const { data: s } = await sb.from("suppliers").select("*").eq("id", data.id).maybeSingle();
    if (!s) throw new Error("Supplier not found");
    const { supplierPing, supplierBalance } = await import("@/lib/suppliers/api.server");
    try {
      const ping = await supplierPing(s);
      // Space out back-to-back calls so strict per-IP limiters (Canboso) don't trip.
      await new Promise((r) => setTimeout(r, 2000));
      const bal = await supplierBalance(s).catch(() => ({ balance: 0, currency: "USD" }));
      return { ok: true, message: `Connected (${ping.status}) · balance ${bal.balance} ${bal.currency}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Failed" };
    }
  });

/** Pull the supplier catalogue into supplier_products and refresh listed prices/stock. */
export const syncSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertSupplierAdmin(context);
    const { data: s } = await sb.from("suppliers").select("*").eq("id", data.id).maybeSingle();
    if (!s) throw new Error("Supplier not found");

    // Use the service client so the snapshot function (service_role-only
    // EXECUTE) is reachable; admin access is already verified above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncSupplierCore } = await import("@/lib/suppliers/sync.server");
    return await syncSupplierCore(supabaseAdmin as any, s, { wait: true });
  });

/** Recent "new product" / "restock" alerts coming from the supplier APIs. */
export const listSupplierAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSupplierAdmin(context);
    const { readAlerts } = await import("@/lib/suppliers/sync.server");
    // The admin bell polls this. The sync itself runs in its own invocation —
    // doing it here burned the request's CPU budget and produced Error 1102.
    const { kickSupplierSync } = await import("@/lib/suppliers/kick.server");
    kickSupplierSync();
    return await readAlerts();
  });

export const clearSupplierAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSupplierAdmin(context);
    const { clearAlerts } = await import("@/lib/suppliers/sync.server");
    await clearAlerts();
    return { ok: true };
  });

/** Sync every enabled supplier right now (used by the bell "check now"). */
export const syncAllSuppliersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSupplierAdmin(context);
    const { syncAllSuppliers } = await import("@/lib/suppliers/sync.server");
    return await syncAllSuppliers();
  });

export const listSupplierProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { supplier_id?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertSupplierAdmin(context);
    const [rowsResult, { data: sups }] = await Promise.all([
      readAllSupplierProducts(sb, data.supplier_id),
      sb.from("suppliers").select("id,key,name,markup_percent,markup_fixed"),
    ]);
    let rows = rowsResult;
    if (!rows) {
      const error = new Error("Supplier catalogue unavailable") as Error & { code?: string };
      const missingTable =
        error.code === "PGRST205" ||
        error.code === "42P01" ||
        /schema cache|does not exist/i.test(error.message ?? "");
      if (missingTable) return [] as any[];
      throw new Error(error.message);
    }
    const { sellPrice } = await import("@/lib/suppliers/api.server");
    const supMap = new Map<string, any>((sups ?? []).map((s: any) => [s.id, s]));
    return rows.map((r: any) => {
      const s = supMap.get(r.supplier_id);
      return {
        ...r,
        supplier_name: s?.name ?? "—",
        sell_price: sellPrice(Number(r.cost_price), {
          price_override: r.price_override,
          markup_percent: r.markup_percent,
          markup_fixed: r.markup_fixed,
          supplier_percent: s?.markup_percent,
          supplier_fixed: s?.markup_fixed,
        }),
      };
    });
  });

/** Update markup / override and switch the bot+website listing on or off. */
export const updateSupplierProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      is_listed?: boolean;
      markup_percent?: number | null;
      markup_fixed?: number | null;
      price_override?: number | null;
      category_id?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertSupplierAdmin(context);
    const { applySupplierProductUpdate } = await import("@/lib/suppliers/listing.server");
    return await applySupplierProductUpdate(sb, data);
  });



/**
 * Admin monitoring: last sync result, pending alert queue depth and the most
 * recent Telegram delivery attempts (success + failure with the real error).
 */
export const supplierSyncHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as any).supabase;
    await assertSupplierAdmin(context);
    const { data } = await sb
      .from("bot_settings")
      .select("key,value")
      .or(
        "key.eq.supplier_sync_stats,key.eq.supplier_last_autosync,key.eq.supplier_last_successful_sync,key.eq.supplier_notify_log,key.like.supplier_notify_queue:%",
      );
    const rows = (data ?? []) as Array<{ key: string; value: string | null }>;
    const get = (key: string) => rows.find((r) => r.key === key)?.value ?? "";
    const parse = (value: string, fallback: any) => {
      try {
        return JSON.parse(value || "null") ?? fallback;
      } catch {
        return fallback;
      }
    };
    const pending = rows
      .filter((r) => r.key.startsWith("supplier_notify_queue:"))
      .reduce((sum, r) => sum + (parse(r.value ?? "[]", []) as any[]).length, 0);
    return {
      stats: parse(get("supplier_sync_stats"), null),
      last_sync: get("supplier_last_autosync") || null,
      last_success: get("supplier_last_successful_sync") || null,
      pending,
      log: (parse(get("supplier_notify_log"), []) as any[]).slice(0, 12),
    };
  });

/**
 * Register (or refresh) the supplier's push webhook so stock/price changes
 * arrive instantly instead of on the next polling tick. `origin` comes from the
 * admin's browser so the endpoint always points at the site they are using.
 */
export const configureSupplierWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; origin: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertSupplierAdmin(context);
    const { data: s } = await sb.from("suppliers").select("*").eq("id", data.id).maybeSingle();
    if (!s) throw new Error("Supplier not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureSupplierWebhook } = await import("@/lib/suppliers/webhook.server");
    try {
      return await ensureSupplierWebhook(supabaseAdmin as any, s, { origin: data.origin, force: true });
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Webhook setup failed" };
    }
  });

