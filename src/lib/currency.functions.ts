import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CurrencyRateRow = {
  code: string;
  name: string;
  rate: number;
  locale_tag: string;
  is_active: boolean;
  sort_order: number;
};

/** Public: the admin-managed conversion table (1 USD = rate). */
export const listCurrencyRates = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await sb
    .from("currency_rates")
    .select("code,name,rate,locale_tag,is_active,sort_order")
    .order("sort_order", { ascending: true });
  return ((data ?? []) as any[]).map((r) => ({
    code: String(r.code),
    name: String(r.name ?? ""),
    rate: Number(r.rate ?? 1),
    locale_tag: String(r.locale_tag ?? "en-US"),
    is_active: Boolean(r.is_active),
    sort_order: Number(r.sort_order ?? 0),
  })) as CurrencyRateRow[];
});

/** Admin: create or update rows in the conversion table. */
export const saveCurrencyRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: CurrencyRateRow[] }) => ({
    rows: (d.rows ?? []).map((r) => ({
      code: String(r.code ?? "").trim().toUpperCase().slice(0, 6),
      name: String(r.name ?? "").trim().slice(0, 60),
      rate: Number(r.rate),
      locale_tag: String(r.locale_tag ?? "en-US").trim().slice(0, 20) || "en-US",
      is_active: Boolean(r.is_active),
      sort_order: Number(r.sort_order ?? 0) || 0,
    })),
  }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context as any).supabase.rpc("has_role", {
      _user_id: (context as any).userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const rows = data.rows.filter((r) => r.code && Number.isFinite(r.rate) && r.rate > 0);
    if (!rows.length) throw new Error("Nothing to save");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("currency_rates").upsert(rows, { onConflict: "code" });
    if (error) throw new Error(error.message);
    return { ok: true, saved: rows.length };
  });

/** Admin: remove a currency from the table. */
export const deleteCurrencyRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => ({ code: String(d.code ?? "").trim().toUpperCase() }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context as any).supabase.rpc("has_role", {
      _user_id: (context as any).userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    if (data.code === "USD") throw new Error("USD is the base currency and cannot be removed");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("currency_rates").delete().eq("code", data.code);
    return { ok: true };
  });
