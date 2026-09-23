import { createFileRoute } from "@tanstack/react-router";

// Read-only catalogue lookup for the n8n automation layer.
// Auth: shared key in the `X-N8N-Key` header. No writes are possible here.
async function run(request: Request) {
  const { n8nKeyOk, searchProducts } = await import("@/lib/n8n/api.server");
  if (!(await n8nKeyOk(request))) return new Response("Unauthorized", { status: 401 });

  let query = "";
  let limit = 8;
  if (request.method === "GET") {
    const url = new URL(request.url);
    query = url.searchParams.get("query") ?? url.searchParams.get("q") ?? "";
    limit = Number(url.searchParams.get("limit") ?? 8);
  } else {
    try {
      const body = (await request.json()) as { query?: unknown; q?: unknown; limit?: unknown };
      query = String(body.query ?? body.q ?? "");
      limit = Number(body.limit ?? 8);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  }
  if (query.length > 200) query = query.slice(0, 200);
  if (!Number.isFinite(limit)) limit = 8;

  const products = await searchProducts(query, limit);
  return Response.json({ ok: true, query, count: products.length, products });
}

export const Route = createFileRoute("/api/public/n8n/products/search")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
