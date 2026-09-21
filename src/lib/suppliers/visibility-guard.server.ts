/**
 * Safety net: an admin-disabled product must never reach a customer.
 *
 * Every catalogue query already filters `is_active = true`, but a stale cache,
 * a bad join or a future refactor could still slip a switched-off product into
 * a list. This guard drops those rows right before they are shown AND records
 * the incident so the admin dashboard + Telegram learn about it immediately.
 */
export type LeakSurface = "bot" | "web" | "api";

const COOLDOWN_MS = 60 * 60 * 1000; // one Telegram ping per product/surface per hour

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

type Row = { id?: string; name?: string; is_active?: boolean } & Record<string, any>;

/** Filters out disabled rows and reports them. Never throws. */
export function guardVisibleProducts<T extends Row>(rows: T[], surface: LeakSurface): T[] {
  if (!Array.isArray(rows) || !rows.length) return rows ?? [];
  const leaked = rows.filter((r) => r && r.is_active === false);
  if (leaked.length) {
    void reportLeak(leaked, surface).catch((e) => console.error("[visibility-guard] report failed:", e));
  }
  return leaked.length ? rows.filter((r) => !(r && r.is_active === false)) : rows;
}

/** Single-product variant: returns null when the product is switched off. */
export function guardVisibleProduct<T extends Row>(row: T | null | undefined, surface: LeakSurface): T | null {
  if (!row) return null;
  return guardVisibleProducts([row], surface)[0] ?? null;
}

async function reportLeak(rows: Row[], surface: LeakSurface) {
  const db = await adminDb();
  const { data: cfg } = await db
    .from("bot_settings")
    .select("value")
    .eq("key", "visibility_alert_enabled")
    .maybeSingle();
  if (String(cfg?.value ?? "on").toLowerCase() === "off") return;

  for (const row of rows.slice(0, 5)) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const key = `visibility_alert_sent:${surface}:${id}`;
    const { data: mark } = await db.from("bot_settings").select("value").eq("key", key).maybeSingle();
    const last = Date.parse(String(mark?.value ?? ""));
    if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) continue;
    await db.from("bot_settings").upsert({ key, value: new Date().toISOString() }, { onConflict: "key" });

    await db.from("visibility_alerts").insert({
      product_id: id,
      product_name: String(row.name ?? ""),
      surface,
      detail: `Disabled product appeared on ${surfaceLabel(surface)} and was blocked automatically.`,
    });

    try {
      const { notifyAdminNotice } = await import("@/lib/bot/engine.server");
      await notifyAdminNotice(
        "Qorix safety check",
        "⚠️ Disabled product was about to be shown",
        `${row.name ?? id}\nSurface: ${surfaceLabel(surface)}\nIt was blocked before any customer could see it. Please check the product settings.`,
      );
    } catch (e) {
      console.error("[visibility-guard] telegram notice failed:", e);
    }
  }
}

function surfaceLabel(surface: LeakSurface) {
  return surface === "bot" ? "Telegram bot" : surface === "web" ? "Website" : "Reseller API";
}
