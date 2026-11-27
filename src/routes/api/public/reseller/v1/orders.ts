import { createFileRoute } from "@tanstack/react-router";
import { isOrderRequestObject, parseOrderQuantity, resellerOrderLimit } from "@/lib/reseller/request-rules";

export const Route = createFileRoute("/api/public/reseller/v1/orders")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/reseller/core.server")).preflight(),

      GET: async ({ request }) => {
        const core = await import("@/lib/reseller/core.server");
        const auth = await core.authReseller(request);
        if ("error" in auth) return auth.error;
        const url = new URL(request.url);
        const limit = resellerOrderLimit(url.searchParams.get("limit"));
        const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset") ?? 0)) || 0);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any)
          .from("orders")
          .select("*")
          .eq("reseller_id", auth.reseller.id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) return core.fail("Order history is temporarily unavailable", 503);
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
        if (!isOrderRequestObject(body)) return core.fail("JSON body must be an object");
        const raw = String(body["channel"] ?? url.searchParams.get("channel") ?? "website").toLowerCase();
        const channel = (["website", "bot"].includes(raw) ? raw : "website") as "website" | "bot";
        const auth = await core.authReseller(request, channel);
        if ("error" in auth) return auth.error;

        if (!body["product_id"]) return core.fail("product_id is required");
        const quantity = parseOrderQuantity(body["quantity"] ?? body["qty"]);
        const headerKey = request.headers.get("idempotency-key")?.trim() || null;
        const bodyKey = body["idempotency_key"] ?? body["external_ref"];
        const bodyRef = typeof bodyKey === "string" && bodyKey.trim() ? bodyKey.trim() : null;
        if (headerKey && bodyRef && headerKey !== bodyRef) return core.fail("Idempotency-Key header and idempotency_key/external_ref must match", 409, { code: "idempotency_mismatch" });
        const ref = headerKey ?? bodyRef;
        if (quantity === null) return core.fail("quantity must be a whole number from 1 to 50");
        const inputs = isOrderRequestObject(body["customer_inputs"]) ? body["customer_inputs"] : {};
        const rawEmail = body["customer_email"] ?? body["email"] ?? inputs["email"];
        const email = typeof rawEmail === "string" && rawEmail.trim() ? rawEmail.trim().slice(0, 254) : null;
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return core.fail("customer_email is invalid");

        // Keep the purchase alive even if the reseller's HTTP client times out
        // or disconnects: otherwise the worker is cancelled between "order
        // recorded" and "wallet charged + delivered", leaving it stuck.
        const work = core.purchase(auth.reseller, {
          product_id: String(body["product_id"]),
          quantity,
          external_ref: ref ? ref.slice(0, 120) : null,
          customer_name: body["customer_name"] ? String(body["customer_name"]).slice(0, 80) : null,
          customer_email: email,
          customer_inputs: body["customer_inputs"],
          channel,
        });
        const { backgroundWaitUntil } = await import("@/lib/bg.server");
        backgroundWaitUntil(work);
        const result = await work;
        if (!result.ok) {
          const { ok: _ok, status, ...rest } = result as any;
          return core.json({ ok: false, ...rest }, status ?? 400);
        }
        return core.json(result, (result as { duplicate?: boolean }).duplicate ? 200 : 201);
      },
    },
  },
});
