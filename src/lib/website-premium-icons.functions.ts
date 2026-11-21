import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { websiteIconInput } from "@/lib/website-premium-icons";

export const saveWebsitePremiumIcons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => websiteIconInput.parse(input))
  .handler(async ({ context, data }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const { prepareWebsiteIconRows } = await import("@/lib/website-premium-icons.server");
    const rows = await prepareWebsiteIconRows(data.values);
    // Save only after every requested icon is ready. Bot menu settings are never touched.
    const { error } = await context.supabase.from("bot_settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error("Could not save website Premium icons.");
    return { ok: true };
  });