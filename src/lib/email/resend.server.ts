/**
 * Resend transactional email helper (server-only).
 *
 * Calls the Resend API directly with RESEND_API_KEY — no Lovable gateway, no
 * LOVABLE_API_KEY — so the same code runs on the Lovable preview (Cloudflare
 * Worker) and on Vercel (Node). Reads env inside each call (never at module
 * scope) and fails soft: a missing key or a provider error never throws, so
 * order/reseller flows are never blocked by email delivery.
 */
import { EMAIL_LOGO_BASE64, EMAIL_LOGO_CID, EMAIL_LOGO_FILENAME } from "./logo-data";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Inline logo reference used by the email header (attached as a cid image). */
export const EMAIL_LOGO_SRC = `cid:${EMAIL_LOGO_CID}`;


/** Email kinds that admins can switch on/off from the admin panel. */
export type EmailKind = "order_receipt" | "admin_notify" | "reseller" | "test";

const TOGGLE_KEY: Record<EmailKind, string> = {
  order_receipt: "email_receipt_enabled",
  admin_notify: "email_admin_notify_enabled",
  reseller: "email_reseller_enabled",
  test: "",
};

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  /** When set, the send is skipped if that email type is disabled in settings. */
  kind?: EmailKind;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string | undefined;
  error?: string | undefined;
  skipped?: boolean | undefined;
}

export interface EmailConfig {
  fromName: string;
  fromAddress: string;
  from: string;
  replyTo: string;
  notifyEmail: string;
  apiKeyConfigured: boolean;
  logoUrl: string;
  toggles: Record<string, boolean>;
}

const CONFIG_KEYS = [
  "email_from_name",
  "email_from_address",
  "email_reply_to",
  "notify_email",
  "bot_name",
  "email_receipt_enabled",
  "email_admin_notify_enabled",
  "email_reseller_enabled",
  "site_brand_logo",
];

/** Absolute base URL of the deployed site (used for the email logo). */
export function siteBaseUrl(): string {
  const raw = process.env["PRODUCTION_SITE_URL"] ?? "https://qorixlab.com";
  return raw.replace(/\/+$/, "");
}

/**
 * Brand header data shared by every email template: site name + absolute logo
 * URL. Uses the admin-uploaded logo when it is an absolute URL, otherwise the
 * bundled logo served from /email-logo.png. Never throws.
 */
export async function getEmailBrand(): Promise<{ siteName: string; logoUrl: string }> {
  let siteName = "Qorix Store";
  let logo = "";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("bot_settings")
      .select("key,value")
      .in("key", ["bot_name", "site_brand_logo"]);
    for (const r of data ?? []) {
      const v = ((r as any).value ?? "").toString().trim();
      if ((r as any).key === "bot_name" && v) siteName = v;
      if ((r as any).key === "site_brand_logo" && v) logo = v;
    }
  } catch (e) {
    console.error("[email] brand load failed:", e);
  }
  return { siteName, logoUrl: resolveLogoUrl(logo) };
}

/**
 * Turn the admin-uploaded website logo into something an email client can load.
 * Absolute URLs (Supabase Storage uploads) are used as-is, site-relative paths
 * are made absolute against the live site, and anything else falls back to the
 * bundled QORIX logo attached inline as a cid image.
 */
export function resolveLogoUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return EMAIL_LOGO_SRC;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (v.startsWith("/")) return `${siteBaseUrl()}${v}`;
  return EMAIL_LOGO_SRC;
}


function isOn(value: string | undefined, fallback = true): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "on" || v === "true" || v === "1" || v === "yes";
}

function envFromAddress(): string {
  const explicit = process.env["RESEND_FROM"];
  if (explicit && explicit.includes("@")) return explicit;
  const domain = (process.env["PRODUCTION_SITE_URL"] ?? "https://qorixlab.com")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `Qorix Store <noreply@${domain}>`;
}

/**
 * Resolve the effective email configuration: admin panel values (bot_settings)
 * win over the RESEND_FROM env fallback. Never throws.
 */
export async function getEmailConfig(): Promise<EmailConfig> {
  const cfg: Record<string, string> = {};
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("bot_settings")
      .select("key,value")
      .in("key", CONFIG_KEYS);
    for (const r of data ?? []) cfg[r.key as string] = ((r as any).value ?? "").toString();
  } catch (e) {
    console.error("[email] settings load failed:", e);
  }

  const envFrom = envFromAddress();
  const envMatch = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(envFrom);
  const fallbackName = (envMatch?.[1] || cfg["bot_name"] || "Qorix Store").trim();
  const fallbackAddress = (envMatch?.[2] || envFrom).trim();

  const fromName = (cfg["email_from_name"] || fallbackName).trim();
  const fromAddress = (cfg["email_from_address"] || fallbackAddress).trim();

  return {
    fromName,
    fromAddress,
    from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
    replyTo: (cfg["email_reply_to"] || "").trim(),
    notifyEmail: (cfg["notify_email"] || "").trim(),
    apiKeyConfigured: Boolean(process.env["RESEND_API_KEY"]),
    logoUrl: resolveLogoUrl(cfg["site_brand_logo"]),
    toggles: {
      email_receipt_enabled: isOn(cfg["email_receipt_enabled"]),
      email_admin_notify_enabled: isOn(cfg["email_admin_notify_enabled"]),
      email_reseller_enabled: isOn(cfg["email_reseller_enabled"]),
    },
  };
}


/**
 * Send one transactional email through Resend. Never throws.
 * Returns { ok: false, error } when the API key is unset or the request fails
 * so callers can treat email as a best-effort side effect.
 */
export async function sendResendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not configured — skipping send to", input.to);
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const config = await getEmailConfig();
  const toggleKey = input.kind ? TOGGLE_KEY[input.kind] : "";
  if (toggleKey && config.toggles[toggleKey] === false) {
    console.warn(`[email] ${input.kind} emails are disabled in admin settings — skipping`);
    return { ok: false, skipped: true, error: "Disabled in email settings" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: (input.replyTo || config.replyTo || "").trim() || undefined,
        tags: input.tags,
        attachments: input.html.includes(EMAIL_LOGO_SRC)
          ? [
              {
                filename: EMAIL_LOGO_FILENAME,
                content: EMAIL_LOGO_BASE64,
                content_type: "image/png",
                content_id: EMAIL_LOGO_CID,
                disposition: "inline",
              },
            ]
          : undefined,
      }),
    });


    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend error [${res.status}] for ${input.to}: ${body}`);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[email] send failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
