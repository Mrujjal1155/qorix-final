import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/reseller/v1/me")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/reseller/core.server")).preflight(),
      GET: async ({ request }) => {
        const core = await import("@/lib/reseller/core.server");
        const auth = await core.authReseller(request);
        if ("error" in auth) return auth.error;
        const r = auth.reseller;
        return core.json({
          ok: true,
          reseller: {
            id: r.id,
            name: r.name,
            balance: Number(r.balance),
            currency: "USD",
            discount_percent: Number(r.discount_percent),
            channels: { website: r.allow_website, bot: r.allow_bot },
          },
        });
      },
    },
  },
});
