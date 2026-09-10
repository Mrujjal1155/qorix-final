/**
 * Sign-up flow that never uses Supabase's own email sender.
 *
 * The account + confirmation link are created server-side with the admin
 * client (generateLink does NOT send anything), then the branded confirmation
 * email goes out through our Resend helper, exactly like every other email in
 * the app.
 */
import { createServerFn } from "@tanstack/react-start";

import { productionUrlFor } from "@/lib/site-url";

export type SignUpInput = {
  email: string;
  password: string;
  fullName?: string;
  reseller?: boolean;
};

const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export const signUpWithBrandedEmail = createServerFn({ method: "POST" })
  .inputValidator((d: SignUpInput) => d)
  .handler(async ({ data }) => {
    const email = clean(data.email, 160).toLowerCase();
    const password = String(data.password ?? "");
    const fullName = clean(data.fullName, 80);
    const reseller = Boolean(data.reseller);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Please enter a valid email address");
    if (password.length < 6) throw new Error("Password must be at least 6 characters");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const redirectTo = productionUrlFor(reseller ? "/reseller/panel" : "/account");

    const { data: link, error } = await db.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        redirectTo,
        data: { full_name: fullName || email, ...(reseller ? { reseller: true } : {}) },
      },
    });

    if (error) {
      const msg = String(error.message ?? "");
      if (/already|registered|exists/i.test(msg)) {
        throw new Error("This email is already registered — please sign in instead.");
      }
      throw new Error(msg || "Could not create the account");
    }

    const verifyUrl = (link?.properties?.action_link as string | undefined) ?? "";
    if (!verifyUrl) throw new Error("Could not create the confirmation link");

    const { sendResendEmail, getEmailBrand } = await import("@/lib/email/resend.server");
    const { siteName, logoUrl } = await getEmailBrand();
    const { accountVerifyEmail } = await import("@/lib/email/templates");

    const sent = await sendResendEmail({
      to: email,
      ...accountVerifyEmail({
        siteName,
        logoUrl,
        ...(fullName ? { name: fullName } : {}),
        verifyUrl,
        reseller,
      }),
    });

    return { ok: true, emailed: sent.ok };
  });
