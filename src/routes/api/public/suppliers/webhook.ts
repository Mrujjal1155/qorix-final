import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Push endpoint for supplier APIs that support webhooks (Vexoran-style).
 * The supplier POSTs `product.stock_changed` / `product.price_changed` /
 * `order.delivered` events here, which makes stock and price updates instant
 * instead of waiting for the next polling tick. Polling stays in place as the
 * safety net — this only makes the happy path immediate.
 *
 * Signature: X-Vexoran-Signature-V2: v2,t=<unix>,n=<nonce>,s=<hmac_sha256_hex>
 * signed over `<t>.<n>.<raw body>` with the secret handed out at registration.
 */
export const Route = createFileRoute("/api/public/suppliers/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const supplierId = url.searchParams.get("s") ?? "";
        if (!supplierId) return new Response("Missing supplier", { status: 400 });

        const rawBody = await request.text();
        const header =
          request.headers.get("x-vexoran-signature-v2") ??
          request.headers.get("x-webhook-signature-v2") ??
          "";
        if (!header) return new Response("Missing signature", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const settingKey = `supplier_webhook_secret:${supplierId}`;
        const { data: row } = await (supabaseAdmin as any)
          .from("bot_settings")
          .select("value")
          .eq("key", settingKey)
          .maybeSingle();
        const secret = String(row?.value ?? "");
        if (!secret) return new Response("Unknown endpoint", { status: 401 });

        const parts: Record<string, string> = {};
        for (const kv of header.split(",").slice(1)) {
          const idx = kv.indexOf("=");
          if (idx > 0) parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
        }
        const t = Number(parts["t"]);
        const nonce = parts["n"] ?? "";
        const sig = parts["s"] ?? "";
        if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) {
          return new Response("Stale timestamp", { status: 401 });
        }
        const expected = createHmac("sha256", secret).update(`${t}.${nonce}.${rawBody}`).digest("hex");
        const a = Buffer.from(expected);
        const b = Buffer.from(sig);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const { data: supplier } = await (supabaseAdmin as any)
          .from("suppliers")
          .select("*")
          .eq("id", supplierId)
          .maybeSingle();
        if (!supplier || supplier.is_enabled === false) {
          // Acknowledge so the supplier does not auto-disable the endpoint.
          return Response.json({ ok: true, ignored: true });
        }

        // Re-read this one supplier's catalogue: it applies exactly the same
        // stock/price diffing, product updates and Telegram alerts as the
        // scheduled sync, so a pushed event and a polled change behave alike.
        const { syncSupplierCore, drainAllNotifications } = await import("@/lib/suppliers/sync.server");
        const result = await syncSupplierCore(supabaseAdmin, supplier).catch((e: unknown) => ({
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        }));
        const delivery = await drainAllNotifications(supabaseAdmin).catch(() => ({ sent: 0, failed: 0 }));

        return Response.json({ ok: true, sync: result, ...delivery });
      },
    },
  },
});
