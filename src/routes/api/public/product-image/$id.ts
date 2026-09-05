// Public product banner endpoint. Telegram cannot read data: URLs, so banners
// stored inline in the database are served as real image responses from here.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/product-image/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id ?? "").slice(0, 64);
        if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await (supabaseAdmin as any)
          .from("products")
          .select("image_url,is_active")
          .eq("id", id)
          .maybeSingle();

        const url: string | null = data?.image_url ?? null;
        if (!data?.is_active || !url) return new Response("Not found", { status: 404 });

        if (/^https?:\/\//i.test(url)) {
          return new Response(null, { status: 302, headers: { Location: url } });
        }

        const match = /^data:([^;,]+);base64,(.+)$/s.exec(url);
        if (!match) return new Response("Not found", { status: 404 });

        const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
        return new Response(bytes, {
          headers: {
            "Content-Type": match[1]!,
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
