import { createFileRoute } from "@tanstack/react-router";

/** Buyer lands here after the OxaPay page. We re-verify, then show the order. */
export const Route = createFileRoute("/api/public/oxapay/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const order = (url.searchParams.get("order") ?? "").replace(/\D/g, "").slice(0, 12);
        const track = (url.searchParams.get("track") ?? "").trim().slice(0, 64);
        if (track) {
          const { settleOxapay } = await import("@/lib/oxapay-settle.server");
          await settleOxapay(track).catch((e) => console.error("[oxapay] return settle failed:", e));
        }
        return new Response(null, {
          status: 302,
          headers: { Location: order ? `/track?order=${order}` : "/track", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
