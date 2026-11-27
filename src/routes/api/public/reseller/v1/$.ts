import { createFileRoute } from "@tanstack/react-router";

// Unknown reseller API paths answer in JSON (not the HTML site 404) so
// integrations and AI agents see a clear, machine-readable error.
const notFound = () =>
  new Response(
    JSON.stringify({ ok: false, error: "Unknown endpoint. See https://qorixlab.com/reseller/docs for the list of endpoints." }),
    { status: 404, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } },
  );

export const Route = createFileRoute("/api/public/reseller/v1/$")({
  server: { handlers: { GET: notFound, POST: notFound } },
});
