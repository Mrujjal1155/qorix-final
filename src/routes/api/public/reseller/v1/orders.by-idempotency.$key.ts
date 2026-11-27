import { createFileRoute } from "@tanstack/react-router";

// Read-only recovery: find the order created with this Idempotency-Key / external_ref.
export const Route = createFileRoute("/api/public/reseller/v1/orders/by-idempotency/$key")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/reseller/core.server")).preflight(),
      GET: async ({ request, params }) => {
        const core = await import("@/lib/reseller/core.server");
        const auth = await core.authReseller(request);
        if ("error" in auth) return auth.error;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("orders")
          .select("*")
          .eq("reseller_id", auth.reseller.id)
          .eq("external_ref", String(params.key).slice(0, 120))
          .maybeSingle();
        if (error) return core.fail("Order is temporarily unavailable", 503);
        if (!data) return core.fail("Order not found", 404);
        return core.json({ ok: true, order: core.orderPayload(data) });
      },
    },
  },
});
