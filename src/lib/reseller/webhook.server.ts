/**
 * Reseller stock webhooks.
 *
 * Every stock / price event that we announce on Telegram is also pushed to the
 * resellers who registered a webhook URL, so their own website or bot updates
 * in real time without polling. Only ACTIVE products are ever pushed — an
 * inactive product simply does not exist for the reseller API.
 */
import { publicProduct, type Reseller } from "./core.server";

export type ResellerEvent = "restock" | "new" | "low" | "out" | "price" | "removed";

type WebhookReseller = Reseller & {
  webhook_url?: string | null;
  webhook_secret?: string | null;
  webhook_events?: string | null;
};

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fire one event to every reseller that asked for it. Never throws — a broken
 * reseller endpoint must not break our own Telegram delivery.
 */
export async function pushResellerEvent(
  event: ResellerEvent,
  product: any,
  extra: Record<string, unknown> = {},
) {
  try {
    // A product that is OFF (or deleted) is invisible to resellers — the only
    // event we still push for it is "removed", so they can hide it instantly.
    if (!product?.id) return;
    if (product.is_active === false && event !== "removed") return;
    const db = await adminDb();
    const { data: rows } = await db
      .from("resellers")
      .select("id,name,discount_percent,is_active,webhook_url,webhook_secret,webhook_events")
      .eq("is_active", true)
      .not("webhook_url", "is", null);
    const targets = (rows ?? []).filter((r: any) => {
      const url = String(r.webhook_url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) return false;
      const wanted = String(r.webhook_events ?? "restock,new,low,out,price,removed")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return wanted.length === 0 || wanted.includes(event);
    }) as WebhookReseller[];
    if (!targets.length) return;

    // Live stock for a manual-stock product.
    let counts: Record<string, number> = {};
    if (!product.supplier_id) {
      const { count } = await db
        .from("stock_items")
        .select("id", { count: "exact", head: true })
        .eq("product_id", product.id)
        .eq("is_sold", false);
      counts = { [product.id]: count ?? 0 };
    }

    const at = new Date().toISOString();
    await Promise.all(
      targets.map(async (reseller) => {
        const payload = {
          event,
          at,
          product: publicProduct(product, reseller as Reseller, counts),
          ...extra,
        };
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
          "content-type": "application/json",
          "x-qorix-event": event,
          "x-qorix-timestamp": at,
        };
        const secret = String(reseller.webhook_secret ?? "");
        if (secret) headers["x-qorix-signature"] = await sign(secret, body);
        let status = "";
        try {
          const res = await fetch(String(reseller.webhook_url), {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(8000),
          });
          status = `${res.status}`;
        } catch (e) {
          status = e instanceof Error ? e.message.slice(0, 120) : "failed";
        }
        await db
          .from("resellers")
          .update({ webhook_last_status: status, webhook_last_at: at })
          .eq("id", reseller.id)
          .then(() => {}, () => {});
      }),
    );
  } catch (error) {
    console.error("Reseller webhook push failed:", error);
  }
}
