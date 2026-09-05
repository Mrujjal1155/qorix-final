import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/reseller/v1/transactions")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/reseller/core.server")).preflight(),
      GET: async ({ request }) => {
        const core = await import("@/lib/reseller/core.server");
        const auth = await core.authReseller(request);
        if ("error" in auth) return auth.error;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await (supabaseAdmin as any)
          .from("reseller_transactions")
          .select("id,type,amount,balance_after,reference,note,created_at")
          .eq("reseller_id", auth.reseller.id)
          .order("created_at", { ascending: false })
          .limit(100);
        return core.json({ ok: true, balance: Number(auth.reseller.balance), transactions: data ?? [] });
      },
    },
  },
});
