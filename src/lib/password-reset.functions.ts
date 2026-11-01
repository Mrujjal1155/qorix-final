/**
 * Password reset that sends the link through our Resend mail system instead
 * of Supabase's own sender. generateLink only creates the link (sends nothing).
 * Always answers the same way so nobody can probe which emails are registered.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { productionUrlFor } from "@/lib/site-url";

const COOLDOWN_MS = 60_000;
const recent = new Map<string, number>();

export const sendPasswordResetEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(160) }).parse(d))
  .handler(async ({ data }) => {
    const email = data.email;
    const now = Date.now();
    const last = recent.get(email) ?? 0;
    if (now - last < COOLDOWN_MS) return { ok: true };
    recent.set(email, now);
    if (recent.size > 5000) recent.clear();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await (supabaseAdmin as any).auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: productionUrlFor("/reset-password") },
    });
    const resetUrl = (link?.properties?.action_link as string | undefined) ?? "";
    if (error || !resetUrl) return { ok: true }; // unknown email: same answer

    const { sendResendEmail, getEmailBrand } = await import("@/lib/email/resend.server");
    const { passwordResetEmail } = await import("@/lib/email/templates");
    const { siteName, logoUrl } = await getEmailBrand();
    const sent = await sendResendEmail({ to: email, ...passwordResetEmail({ siteName, logoUrl, resetUrl }) });
    if (!sent.ok) console.error("[password-reset] Resend send failed:", sent.error);
    return { ok: true };
  });
