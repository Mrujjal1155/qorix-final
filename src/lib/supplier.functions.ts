import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSupplierAdmin } from "@/lib/suppliers/admin-support";

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

    const { syncSupplierCore } = await import("@/lib/suppliers/sync.server");
    return await syncSupplierCore(sb, s);
  });

/** Recent "new product" / "restock" alerts coming from the supplier APIs. */
export const listSupplierAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSupplierAdmin(context);
    const { readAlerts, maybeAutoSyncSuppliers } = await import("@/lib/suppliers/sync.server");
    // The admin bell polls this — run the throttled sync first so new supplier
    // stock shows up (and gets announced) without pressing anything.
    await maybeAutoSyncSuppliers().catch(() => ({ skipped: true }));
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
    let q = sb.from("supplier_products").select("*").order("name");
    if (data.supplier_id) q = q.eq("supplier_id", data.supplier_id);
    const [{ data: rows, error }, { data: sups }] = await Promise.all([
      q,
      sb.from("suppliers").select("id,key,name,markup_percent,markup_fixed"),
    ]);
    if (error) {
      const missingTable =
        error.code === "PGRST205" ||
        error.code === "42P01" ||
        /schema cache|does not exist/i.test(error.message ?? "");
      if (missingTable) return [] as any[];
      throw new Error(error.message);
    }
    const { sellPrice } = await import("@/lib/suppliers/api.server");
    const supMap = new Map<string, any>((sups ?? []).map((s: any) => [s.id, s]));
    return (rows ?? []).map((r: any) => {
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
    const { data: row } = await sb.from("supplier_products").select("*").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Not found");
    const { data: sup } = await sb.from("suppliers").select("*").eq("id", row.supplier_id).maybeSingle();

    const patch: any = {};
    for (const k of ["is_listed", "markup_percent", "markup_fixed", "price_override"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    const merged = { ...row, ...patch };

    const { sellPrice, detailsFromRaw, extraDetailsFromRaw } = await import("@/lib/suppliers/api.server");
    const price = sellPrice(Number(merged.cost_price), {
      price_override: merged.price_override,
      markup_percent: merged.markup_percent,
      markup_fixed: merged.markup_fixed,
      supplier_percent: sup?.markup_percent,
      supplier_fixed: sup?.markup_fixed,
    });

    if (merged.is_listed) {
      const d = detailsFromRaw(merged.raw);
      const productRow: any = {
        name: merged.name,
        description: d.description ?? merged.description,
        price,
        delivery_type: "auto",
        supplier_id: merged.supplier_id,
        supplier_external_id: merged.external_id,
        supplier_stock: merged.stock,
        is_active: Boolean(sup?.is_enabled),
      };
      if (d.image_url) productRow.image_url = d.image_url;
      if (d.delivery_time) productRow.delivery_time = d.delivery_time;
      if (d.important_note) productRow.important_note = d.important_note;
      if (d.quick_guide) productRow.quick_guide = d.quick_guide;
      const extraDetails = extraDetailsFromRaw(merged.raw);
      if (extraDetails.length) productRow.details = extraDetails;

      if (data.category_id !== undefined) productRow.category_id = data.category_id || null;

      // A product may already exist for this supplier item (link lost, earlier
      // failed save, or a parallel toggle). Reuse it instead of creating a twin.
      let targetProductId: string | null = merged.product_id ?? null;
      if (targetProductId) {
        const { data: stillThere } = await sb
          .from("products")
          .select("id")
          .eq("id", targetProductId)
          .maybeSingle();
        if (!stillThere) targetProductId = null;
      }
      if (!targetProductId) {
        const { data: existingProduct } = await sb
          .from("products")
          .select("id")
          .eq("supplier_id", merged.supplier_id)
          .eq("supplier_external_id", merged.external_id)
          .maybeSingle();
        targetProductId = existingProduct?.id ?? null;
        if (targetProductId) patch.product_id = targetProductId;
      }

      if (targetProductId) {
        const { error } = await sb.from("products").update(productRow).eq("id", targetProductId);
        if (error) throw new Error(error.message);
      } else {
        // Supplier products have no icon of their own — reuse the admin's
        // default product icon (Premium custom emoji supported).
        const { data: iconRow } = await sb
          .from("bot_settings")
          .select("value")
          .eq("key", "ui_icon_prod_icon_default")
          .maybeSingle();
        const { parseIconValue } = await import("@/lib/bot/ui.server");
        const icon = parseIconValue(String(iconRow?.value ?? ""), "📦");
        // products has only a PARTIAL unique index on
        // (supplier_id, supplier_external_id), which ON CONFLICT cannot use,
        // so the lookup above decides between update and plain insert.

        const { data: created, error } = await sb
          .from("products")
          .insert({
            emoji: icon.glyph || "📦",
            telegram_custom_emoji_id: icon.customId || null,
            ...productRow,
          })
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);

        patch.product_id = created?.id ?? null;
      }

    } else if (merged.product_id) {
      await sb.from("products").update({ is_active: false }).eq("id", merged.product_id);
    }

    const { error: upErr } = await sb.from("supplier_products").update(patch).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    // Listing switched OFF -> ON: the admin decided to sell it, so the channel
    // gets a NEW PRODUCT card right away. Products left OFF stay silent and are
    // only visible through the admin bell feed.
    const wasListed = Boolean(row.is_listed);
    const productId = patch.product_id ?? merged.product_id;
    if (!wasListed && merged.is_listed && productId) {
      try {
        const { data: prod } = await sb.from("products").select("*").eq("id", productId).maybeSingle();
        if (prod) {
          const { announceNewProduct } = await import("@/lib/bot/engine.server");
          await announceNewProduct(prod);
        }
      } catch (e) {
        console.error("New product announcement failed:", e);
      }
    }

    return { ok: true, price };
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
    const { data } = await sb.from("bot_settings").select("key,value");
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

