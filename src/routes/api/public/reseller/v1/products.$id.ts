import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/reseller/v1/products/$id")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/reseller/core.server")).preflight(),
      GET: async ({ request, params }) => {
        const core = await import("@/lib/reseller/core.server");
        // Query params (incl. `_ts`) are ignored by this endpoint, so they never affect the cache key.
        const auth = await core.authReseller(request, "all", { cached: true });
        if ("error" in auth) return auth.error;
        const product = await core.singleProductCached(auth.reseller, String(params.id));
        if (!product) return core.fail("Product not found", 404);
        return core.json({ ok: true, product });
      },
    },
  },
});
