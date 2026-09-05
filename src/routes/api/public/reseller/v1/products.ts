import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/reseller/v1/products")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/reseller/core.server")).preflight(),
      GET: async ({ request }) => {
        const core = await import("@/lib/reseller/core.server");
        const url = new URL(request.url);
        const raw = (url.searchParams.get("channel") ?? "website").toLowerCase();
        const channel = (["website", "bot", "all"].includes(raw) ? raw : "website") as "website" | "bot" | "all";
        const auth = await core.authReseller(request, channel === "all" ? "all" : channel);
        if ("error" in auth) return auth.error;

        const { categories, products } = await core.catalogue(auth.reseller, channel);
        const q = (url.searchParams.get("search") ?? "").trim().toLowerCase();
        const cat = url.searchParams.get("category_id");
        let list = products;
        if (q) list = list.filter((p: any) => p.name.toLowerCase().includes(q));
        if (cat) list = list.filter((p: any) => p.category_id === cat);
        return core.json({ ok: true, channel, count: list.length, categories, products: list });
      },
    },
  },
});
