// Signed, expiring public download endpoint for order credential files.
// Telegram fetches this URL when the bot sends the order .txt document.
import { createFileRoute } from "@tanstack/react-router";
import {
  isOrderDownloadable,
  orderFileText,
  orderPlainText,
  verifyOrderToken,
} from "@/lib/order-file.server";

// Basic per-isolate rate limit (best effort): 20 requests / minute per IP.
const WINDOW_MS = 60_000;
const MAX_HITS = 20;
const hits = new Map<string, { n: number; reset: number }>();
function limited(ip: string) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const e = hits.get(ip);
  if (!e || e.reset < now) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  e.n += 1;
  return e.n > MAX_HITS;
}

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export const Route = createFileRoute("/api/public/order-file/$token/$name")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";
        if (limited(ip)) {
          return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
        }

        const parsed = verifyOrderToken(String(params.token ?? ""));
        if (!parsed) return notFound();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order } = await (supabaseAdmin as any)
          .from("orders")
          .select("id, order_no, product_name, quantity, total, status, created_at, delivered_content")
          .eq("id", parsed.orderId)
          .maybeSingle();
        if (!isOrderDownloadable(order)) return notFound();

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
