import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type ExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Let bookkeeping run after the response instead of delaying it.
      try {
        const { setExecutionCtx } = await import("./lib/bg.server");
        setExecutionCtx(ctx);
      } catch {
        /* non-worker runtime → background work is awaited inline */
      }
      // Keep the Telegram webhook registered without any manual step.
      try {
        const { ensureWebhookOnce } = await import("./lib/bot/ensure-webhook.server");
        ensureWebhookOnce();
      } catch (error) {
        console.error("Webhook ensure skipped:", error);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
  scheduled(_controller: unknown, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(
      import("./lib/suppliers/sync.server")
        .then(async ({ drainAllNotifications, maybeAutoSyncSuppliers }) => {
          // Pending Telegram cards go out first: they must never be delayed by
          // a slow supplier catalogue call in the same invocation.
          await drainAllNotifications().catch((error) =>
            console.error("Scheduled alert delivery failed:", error),
          );
          await maybeAutoSyncSuppliers();
        })
        .catch((error) => console.error("Scheduled supplier sync failed:", error)),
    );
  },
};
