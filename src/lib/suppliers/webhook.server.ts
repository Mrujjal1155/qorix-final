/**
 * Supplier push-webhook registration.
 *
 * Suppliers that expose a webhook API (Vexoran-style) can push stock/price
 * changes to us instantly. Registration used to be a manual admin button; this
 * helper lets the automatic sync keep the endpoint registered on its own, so
 * realtime alerts survive a URL change, a rotated secret or a deleted endpoint
 * without anyone pressing anything.
 */
import { productionUrlFor } from "@/lib/site-url";
import type { SupplierRow } from "./api.server";

const SECRET_KEY = (id: string) => `supplier_webhook_secret:${id}`;
const STAMP_KEY = (id: string) => `supplier_webhook_at:${id}`;
/** Re-verify the registration at most this often (ms). */
const REFRESH_MS = 6 * 60 * 60_000;

export function supplierWebhookUrl(supplierId: string, origin?: string) {
  const base = origin && /^https:\/\//i.test(origin) ? origin.replace(/\/+$/, "") : null;
  const path = `/api/public/suppliers/webhook?s=${supplierId}`;
  return base ? `${base}${path}` : productionUrlFor(path);
}

export const SUPPLIER_WEBHOOK_EVENTS = [
  "product.price_changed",
  "product.stock_changed",
  "order.delivered",
];

/**
 * Make sure the supplier pushes changes to us. Safe to call on every sync:
 * it only talks to the supplier when the endpoint is missing, points somewhere
 * else, or has not been verified for REFRESH_MS.
 */
export async function ensureSupplierWebhook(
  sb: any,
  s: SupplierRow,
  opts: { origin?: string; force?: boolean } = {},
): Promise<{ ok: boolean; message: string }> {
  const api = await import("./api.server");
  if (!api.supplierSupportsWebhooks(s)) {
    return { ok: false, message: "This supplier has no webhook API — polling stays active." };
  }

  const id = String((s as any).id);
  const url = supplierWebhookUrl(id, opts.origin);

  const { data: stampRow } = await sb.from("bot_settings").select("value").eq("key", STAMP_KEY(id)).maybeSingle();
  let stamp: { at?: number; url?: string } = {};
  try {
    stamp = JSON.parse(String((stampRow as any)?.value ?? "") || "{}");
  } catch {
    stamp = {};
  }
  const { data: secretRow } = await sb.from("bot_settings").select("value").eq("key", SECRET_KEY(id)).maybeSingle();
  const hasSecret = Boolean(String((secretRow as any)?.value ?? "").trim());
  const fresh = hasSecret && stamp.url === url && Date.now() - Number(stamp.at ?? 0) < REFRESH_MS;
  if (fresh && !opts.force) return { ok: true, message: "Realtime already on" };

  // Registered endpoint list is the source of truth at the supplier's side.
  const existing = await api.supplierWebhooks(s).catch(() => ({ webhooks: [] as any[] }));
  const ours = (existing.webhooks ?? []).filter((w: any) =>
    String(w?.url ?? "").includes("/api/public/suppliers/webhook"),
  );
  const matching = ours.find((w: any) => String(w.url) === url);
  if (matching && hasSecret && !opts.force) {
    await sb
      .from("bot_settings")
      .upsert({ key: STAMP_KEY(id), value: JSON.stringify({ at: Date.now(), url }) }, { onConflict: "key" });
    return { ok: true, message: `Realtime alerts on · ${url}` };
  }

  // Drop stale endpoints (old URL, or secret we no longer hold) and re-register.
  for (const w of ours) await api.supplierDeleteWebhook(s, String(w.id)).catch(() => {});
  const created = await api.supplierRegisterWebhook(s, url, SUPPLIER_WEBHOOK_EVENTS);
  if (!created.secret) return { ok: false, message: "Supplier did not return a signing secret — try again." };

  await sb.from("bot_settings").upsert({ key: SECRET_KEY(id), value: created.secret }, { onConflict: "key" });
  await sb
    .from("bot_settings")
    .upsert({ key: STAMP_KEY(id), value: JSON.stringify({ at: Date.now(), url }) }, { onConflict: "key" });
  return { ok: true, message: `Realtime alerts on · ${url}` };
}
