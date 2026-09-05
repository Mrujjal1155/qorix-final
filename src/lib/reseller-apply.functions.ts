import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { productionUrlFor } from "@/lib/site-url";

export type ApplyInput = {
  name: string;
  email: string;
  telegram?: string;
  website?: string;
  channel?: string;
  monthly_volume?: string;
  message?: string;
};

const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

/** Public: a visitor applies for a reseller account. */
export const submitResellerApplication = createServerFn({ method: "POST" })
  .inputValidator((d: ApplyInput) => d)
  .handler(async ({ data }) => {
    const name = clean(data.name, 80);
    const email = clean(data.email, 120).toLowerCase();
    if (name.length < 2) throw new Error("Please enter your name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Please enter a valid email address");

    const channelRaw = clean(data.channel, 20).toLowerCase();
    const channel = ["website", "bot", "both"].includes(channelRaw) ? channelRaw : "website";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: dup } = await db
      .from("reseller_applications")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (dup) return { ok: true, duplicate: true };

    const { error } = await db.from("reseller_applications").insert({
      name,
      email,
      telegram: clean(data.telegram, 80) || null,
      website: clean(data.website, 200) || null,
      channel,
      monthly_volume: clean(data.monthly_volume, 60) || null,
      message: clean(data.message, 2000) || null,
    });
    if (error) throw new Error(error.message);

    return { ok: true, duplicate: false };

  });

async function assertAdmin(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listResellerApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await (context as any).supabase
      .from("reseller_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

function newApiKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "qxr_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Strong readable temporary password for a freshly created reseller login. */
function newTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return "Qx-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export const setApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string; admin_note?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const status = ["pending", "approved", "rejected"].includes(data.status) ? data.status : "pending";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const { data: app } = await db.from("reseller_applications").select("*").eq("id", data.id).maybeSingle();
    if (!app) throw new Error("Application not found");

    const patch: Record<string, unknown> = { status, admin_note: data.admin_note ?? null };
    let inviteUrl: string | null = null;
    let emailed = false;
    let createdAccount = false;
    const tempPassword = newTempPassword();

    if (status === "approved") {
      patch["approved_at"] = new Date().toISOString();

      // Make sure a reseller account exists for this email.
      // NEVER overwrite or replace an existing reseller: balance, API key,
      // orders and site settings of an already approved reseller stay intact.
      let resellerId: string | null = app.reseller_id ?? null;
      if (!resellerId) {
        const { data: existingRows } = await db
          .from("resellers")
          .select("id")
          .ilike("email", app.email)
          .order("created_at", { ascending: true })
          .limit(1);
        const existing = existingRows?.[0];
        if (existing) resellerId = existing.id;
        else {
          const { data: created } = await db
            .from("resellers")
            .insert({
              name: app.name || app.email,
              email: app.email,
              api_key: newApiKey(),
              allow_website: app.channel !== "bot",
              allow_bot: app.channel !== "website",
            })
            .select("id")
            .maybeSingle();
          resellerId = created?.id ?? null;
        }
        patch["reseller_id"] = resellerId;
      }

      const panelStartUrl = productionUrlFor(`/reseller/start?email=${encodeURIComponent(app.email)}`);
      const redirectTo = productionUrlFor("/reseller/panel");

      // 1) Make sure a login (auth user) exists for this email.
      let authUserId: string | null = null;
      try {
        const { data: createdUser, error: createErr } = await db.auth.admin.createUser({
          email: app.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: app.name || app.email, reseller: true },
        });
        if (!createErr && createdUser?.user?.id) {
          authUserId = createdUser.user.id;
          createdAccount = true;
        }
      } catch {
        /* already exists – handled below */
      }

      // 2) One-click sign-in / set-password link for the approval email.
      try {
        const { data: linkData } = await db.auth.admin.generateLink({
          type: createdAccount ? "magiclink" : "recovery",
          email: app.email,
          options: { redirectTo },
        });
        inviteUrl = (linkData?.properties?.action_link as string | undefined) ?? null;
        if (!authUserId && linkData?.user?.id) authUserId = linkData.user.id;
        emailed = Boolean(inviteUrl);
      } catch {
        emailed = false;
      }
      if (!inviteUrl) inviteUrl = panelStartUrl;

      // 3) Bind the login to the reseller record so the panel unlocks instantly.
      if (authUserId && resellerId) {
        try {
          await db.from("resellers").update({ user_id: authUserId }).eq("id", resellerId).is("user_id", null);
        } catch {
          /* non-fatal */
        }
      }
    }

    const { error } = await db.from("reseller_applications").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Branded "you're approved" email containing the sign-in link (and the
    // temporary password when we just created the account for them).
    if (status === "approved") {
      try {
        const { sendResendEmail, getEmailBrand } = await import("@/lib/email/resend.server");
        const { logoUrl } = await getEmailBrand();
        const { resellerApprovedEmail } = await import("@/lib/email/templates");
        const { data: siteRow } = await db.from("bot_settings").select("value").eq("key", "bot_name").maybeSingle();
        const siteName = (siteRow?.value as string) || "Qorix Store";
        const panelUrl = productionUrlFor(`/reseller/start?email=${encodeURIComponent(app.email)}`);
        const apiDocsUrl = productionUrlFor("/reseller/docs");
        await sendResendEmail({
          to: app.email,
          kind: "reseller",
          ...resellerApprovedEmail({
            siteName,
            logoUrl,
            name: app.name,
            panelUrl,
            apiDocsUrl,
            ...(inviteUrl ? { signInUrl: inviteUrl } : {}),
            ...(createdAccount ? { tempPassword } : {}),
          }),
        });
      } catch (e) {
        console.error("[email] reseller approval email failed:", e);
      }
    }

    return { ok: true, invite_url: inviteUrl, emailed, created_account: createdAccount };
  });


export const deleteResellerApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await (context as any).supabase.from("reseller_applications").delete().eq("id", data.id);
    return { ok: true };
  });
