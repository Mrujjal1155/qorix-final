import { createFileRoute } from "@tanstack/react-router";

/**
 * OxaPay payment webhook. The body must carry a valid HMAC-SHA512 signature
 * (merchant key over the raw body). Even then the body is only a hint:
 * settleOxapay() re-reads the invoice from OxaPay before crediting anything.
 */
export const Route = createFileRoute("/api/public/oxapay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 50_000) return new Response("too large", { status: 413 });
        const { oxapaySettings } = await import("@/lib/oxapay-settle.server");
        const { oxapayKey, oxapayVerifySignature } = await import("@/lib/oxapay.server");
        const key = oxapayKey(await oxapaySettings());
        if (!oxapayVerifySignature(key, raw, request.headers.get("HMAC") ?? request.headers.get("hmac"))) {
          return new Response("invalid signature", { status: 401 });
        }
        let body: any = null;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        if (String(body?.type ?? "") === "payout") return new Response("ok");
        const trackId = String(body?.track_id ?? "").trim();
        if (!trackId) return new Response("ok");
        const status = String(body?.status ?? "").toLowerCase();
        if (status === "paid" || status === "manual_accept") {
          const { settleOxapay } = await import("@/lib/oxapay-settle.server");
          const r = await settleOxapay(trackId);
          if (!r.ok) console.error(`[oxapay] webhook ${trackId}: ${r.reason}`);
        }
        return new Response("ok", { headers: { "Content-Type": "text/plain" } });
      },
    },
  },
});
