import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden");
}

type Bucket = { total: number; delivered: number; failed: number; pending: number; attempts: number };

function emptyBucket(): Bucket {
  return { total: 0, delivered: 0, failed: 0, pending: 0, attempts: 0 };
}

function sourceGroup(source: string | null, productSupplier: boolean): string {
  const s = (source ?? "").toLowerCase();
  if (s.startsWith("inhouse") || s === "inhouse_sale") return "In-house sales";
  if (s.startsWith("admin")) return "Admin actions";
  if (s.startsWith("bot:")) return "Bot admin";
  if (s.startsWith("reseller")) return "Reseller";
  if (s.startsWith("supplier") || productSupplier) return "Supplier sync";
  return "Other";
}

function add(map: Record<string, Bucket>, key: string, row: any) {
  const b = (map[key] ??= emptyBucket());
  b.total += 1;
  b.attempts += Number(row.attempts ?? 0);
  if (row.status === "delivered") b.delivered += 1;
  else if (row.status === "failed") b.failed += 1;
  else b.pending += 1;
}

/** Aggregated health of the stock-alert delivery queue (admin only, read-only). */
export const getStockAlertStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => d)
  .handler(async ({ data, context }) => {
    const sb = (context as any).supabase;
    await assertAdmin(context);

    const days = Math.max(1, Math.min(90, Number(data?.days ?? 7)));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: rows, error } = await sb
      .from("stock_notification_events")
      .select(
        "id,product_id,kind,source,status,attempts,last_error,created_at,delivered_at,next_attempt_at,stock,added_qty",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const events = (rows ?? []) as any[];
    const productIds = [...new Set(events.map((e) => e.product_id).filter(Boolean))];
    const nameById: Record<string, { name: string; supplier: boolean }> = {};
    if (productIds.length) {
      const { data: prods } = await sb.from("products").select("id,name,supplier_id").in("id", productIds);
      for (const p of prods ?? []) nameById[p.id] = { name: p.name, supplier: Boolean(p.supplier_id) };
    }

    const totals = emptyBucket();
    const bySource: Record<string, Bucket> = {};
    const byKind: Record<string, Bucket> = {};
    const trendMap: Record<string, { day: string; delivered: number; failed: number; total: number }> = {};
    const latencies: number[] = [];

    for (const e of events) {
      totals.total += 1;
      totals.attempts += Number(e.attempts ?? 0);
      if (e.status === "delivered") totals.delivered += 1;
      else if (e.status === "failed") totals.failed += 1;
      else totals.pending += 1;

      add(bySource, sourceGroup(e.source, nameById[e.product_id]?.supplier ?? false), e);
      add(byKind, e.kind ?? "other", e);

      const day = String(e.created_at).slice(0, 10);
      const t = (trendMap[day] ??= { day, delivered: 0, failed: 0, total: 0 });
      t.total += 1;
      if (e.status === "delivered") t.delivered += 1;
      else if (e.status === "failed") t.failed += 1;

      if (e.delivered_at && e.created_at) {
        const ms = new Date(e.delivered_at).getTime() - new Date(e.created_at).getTime();
        if (ms >= 0) latencies.push(ms);
      }
    }

    latencies.sort((a, b) => a - b);
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]! : 0;

    const problems = events
      .filter((e) => e.status === "failed" || e.status === "retry")
      .slice(0, 30)
      .map((e) => ({
        id: e.id,
        productId: e.product_id,
        productName: nameById[e.product_id]?.name ?? "Unknown product",
        kind: e.kind,
        source: e.source,
        status: e.status,
        attempts: e.attempts,
        lastError: e.last_error,
        createdAt: e.created_at,
        nextAttemptAt: e.next_attempt_at,
      }));

    const toList = (m: Record<string, Bucket>) =>
      Object.entries(m)
        .map(([label, b]) => ({ label, ...b }))
        .sort((a, b) => b.total - a.total);

    return {
      days,
      totals,
      deliveryRate: totals.total ? Math.round((totals.delivered / totals.total) * 1000) / 10 : 0,
      avgLatencySec: Math.round(avgLatency / 100) / 10,
      p95LatencySec: Math.round(p95 / 100) / 10,
      bySource: toList(bySource),
      byKind: toList(byKind),
      trend: Object.values(trendMap).sort((a, b) => a.day.localeCompare(b.day)),
      problems,
    };
  });

/** Re-queue one existing alert event. Never creates a new event, so no duplicates. */
export const retryStockAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("stock_notification_events")
      .update({ status: "pending", next_attempt_at: new Date().toISOString(), claimed_at: null, last_error: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { drainAllNotifications } = await import("@/lib/suppliers/sync.server");
    await drainAllNotifications().catch(() => {});
    return { ok: true };
  });
