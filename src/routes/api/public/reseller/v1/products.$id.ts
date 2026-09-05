import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/reseller/v1/products/$id")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/reseller/core.server")).preflight(),
      GET: async ({ request, params }) => {
        const core = await import("@/lib/reseller/core.server");
        const auth = await core.authReseller(request);
        if ("error" in auth) return auth.error;
        const product = await core.singleProduct(auth.reseller, String(params.id));
        if (!product) return core.fail("Product not found", 404);
        return core.json({ ok: true, product });
      },
    },
  },
});
