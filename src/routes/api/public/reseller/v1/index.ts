import { createFileRoute } from "@tanstack/react-router";

// Public service metadata so integrations can check the base URL without a key.
const meta = () =>
  new Response(JSON.stringify({ ok: true, service: "reseller-api", version: "v1", docs: "https://qorixlab.com/reseller/docs" }), {
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });

export const Route = createFileRoute("/api/public/reseller/v1/")({
  server: { handlers: { GET: meta } },
});
