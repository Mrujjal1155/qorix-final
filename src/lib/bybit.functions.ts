import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bybitUidSchema } from "@/lib/bybit-payment";

export const checkBybitStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { uid: string }) => ({ uid: bybitUidSchema.parse(data.uid) }))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const apiKey = process.env["BYBIT_API_KEY"];
    const secret = process.env["BYBIT_API_SECRET"];
    let result = { ok: false, message: "Bybit API credentials are not configured." };
    if (apiKey && secret) {
      try {
        const { checkBybitCredentials } = await import("@/lib/bybit.server");
        result = await checkBybitCredentials({ apiKey, secret }, data.uid);
      } catch (error) {
        result = { ok: false, message: error instanceof Error ? error.message : "Bybit connection unavailable." };
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bot_settings").upsert([
      { key: "bybit_uid", value: data.uid }, { key: "bybit_api_verified", value: result.ok ? "1" : "0" },
      ...(!result.ok ? [{ key: "bybit_enabled", value: "0" }] : []),
    ], { onConflict: "key" });
    if (error) throw new Error("Could not save Bybit verification status.");
    return result;
  });