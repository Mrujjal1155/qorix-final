import { createFileRoute } from "@tanstack/react-router";

// Idempotent, safe repair endpoint: it can only ever point Telegram at THIS
// site's own webhook URL and returns no user data.
async function run(request: Request) {
  const { ensureWebhook } = await import("@/lib/bot/ensure-webhook.server");
  const { canonicalOrigin } = await import("@/lib/site-url");
  const origin = canonicalOrigin(new URL(request.url).origin);
  // Always renew the registration here. Telegram does not expose the saved
  // secret, so a URL can look correct while still sending an outdated secret.
  const result = await ensureWebhook(origin, true);
  return Response.json(result, { status: result.ok ? 200 : 503 });
}

export const Route = createFileRoute("/api/public/telegram/register")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
