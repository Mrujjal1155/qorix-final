import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/reseller/v1/orders/$id")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/reseller/core.server")).preflight(),
      GET: async ({ request, params }) => {
        const core = await import("@/lib/reseller/core.server");
        const auth = await core.authReseller(request);
        if ("error" in auth) return auth.error;
        const id = String(params.id);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const isUuid = /^[0-9a-f-]{36}$/i.test(id);
        let query = db.from("orders").select("*").eq("reseller_id", auth.reseller.id);
        if (isUuid) query = query.eq("id", id);
        else if (/^\d+$/.test(id)) query = query.eq("order_no", Number(id));
        // external_ref is caller-supplied text — never interpolate it into a PostgREST filter.
        else query = query.eq("external_ref", id);

        const { data } = await query.maybeSingle();
        if (!data) return core.fail("Order not found", 404);
        return core.json({ ok: true, order: core.orderPayload(data) });
      },
    },
  },
});
