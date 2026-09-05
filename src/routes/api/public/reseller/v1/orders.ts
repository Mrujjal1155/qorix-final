import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/reseller/v1/orders")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/reseller/core.server")).preflight(),

      GET: async ({ request }) => {
        const core = await import("@/lib/reseller/core.server");
        const auth = await core.authReseller(request);
        if ("error" in auth) return auth.error;
        const url = new URL(request.url);
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await (supabaseAdmin as any)
          .from("orders")
          .select("*")
          .eq("reseller_id", auth.reseller.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        return core.json({ ok: true, orders: (data ?? []).map(core.orderPayload) });
      },

      POST: async ({ request }) => {
        const core = await import("@/lib/reseller/core.server");
        const url = new URL(request.url);
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return core.fail("Invalid JSON body");
        }
        const raw = String(body.channel ?? url.searchParams.get("channel") ?? "website").toLowerCase();
        const channel = (["website", "bot"].includes(raw) ? raw : "website") as "website" | "bot";
        const auth = await core.authReseller(request, channel);
        if ("error" in auth) return auth.error;

        if (!body.product_id) return core.fail("product_id is required");
        const email = body.customer_email ? String(body.customer_email).trim() : null;
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return core.fail("customer_email is invalid");

        const result = await core.purchase(auth.reseller, {
          product_id: String(body.product_id),
          quantity: Number(body.quantity ?? 1),
          external_ref: body.external_ref ? String(body.external_ref).slice(0, 120) : null,
          customer_name: body.customer_name ? String(body.customer_name).slice(0, 80) : null,
          customer_email: email,
          channel,
        });
        if (!result.ok) {
          const { ok: _ok, status, ...rest } = result as any;
          return core.json({ ok: false, ...rest }, status ?? 400);
        }
        return core.json(result, 201);
      },
    },
  },
});
