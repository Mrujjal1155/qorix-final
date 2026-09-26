// Scheduler authentication for public cron endpoints.
// The secret lives in bot_settings.cron_secret (admin/server-only via RLS)
// and is sent by pg_cron in the x-cron-secret header. Fails closed.
import { timingSafeEqual } from "crypto";

export async function isCronAuthorized(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!provided) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("bot_settings")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();
  const expected = String(data?.value ?? "");
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
