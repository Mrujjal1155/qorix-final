// Signed, public download endpoint for order credential files.
// Telegram fetches this URL when the bot sends the order .txt document.
import { createFileRoute } from "@tanstack/react-router";
import {
  orderFileText,
  orderPlainText,
  verifyOrderToken,
} from "@/lib/order-file.server";

export const Route = createFileRoute("/api/public/order-file/$token/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsed = verifyOrderToken(String(params.token ?? ""));
        if (!parsed) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order } = await (supabaseAdmin as any)
          .from("orders")
          .select("*")
          .eq("id", parsed.orderId)
          .maybeSingle();
        if (!order) return new Response("Not found", { status: 404 });

        const { data: brandRow } = await (supabaseAdmin as any)
          .from("bot_settings")
          .select("value")
          .eq("key", "bot_name")
          .maybeSingle();
        const brand = String(brandRow?.value ?? "").trim() || "QORIX";

        const body = parsed.kind === "plain" ? orderPlainText(order) : orderFileText(order, brand);
        const name = String(params.name ?? "order.txt").replace(/[^A-Za-z0-9._-]/g, "");
        return new Response(body || "No credentials found.\n", {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${name || "order.txt"}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
