/**
 * Pure HTML email templates (no secrets, no React Email render step).
 * Each builder returns { subject, html, text } for the Resend helper.
 *
 * Styling rules: inline styles only, Body background #ffffff, brand accent
 * color matches the app primary token. No external CSS, no scripts.
 */

const BRAND = "#6d5bd8";
const BRAND_DARK = "#4f3fbf";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function esc(t: unknown): string {
  return String(t ?? "").replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

function money(n: number): string {
  return `$${Number(n || 0).toFixed(2)}`;
}

/** Brand header: logo only (no text), centered, in every email. */
function header(siteName: string, logoUrl?: string): string {
  if (!logoUrl) return "";
  return `<tr><td align="center" style="background:#ffffff;padding:24px 28px 18px 28px;border-bottom:1px solid ${BORDER};">
    <img src="${esc(logoUrl)}" alt="" width="132" style="display:block;border:0;outline:none;width:132px;max-width:60%;height:auto;" />
  </td></tr>`;
}

function shell(inner: string, siteName: string, logoUrl?: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
        ${header(siteName, logoUrl)}
        <tr><td style="padding:28px 28px 8px 28px;">${inner}</td></tr>
        <tr><td style="padding:8px 28px 24px 28px;">
          <p style="margin:0;font-size:12px;color:${MUTED};line-height:1.5;">This is a service email from ${esc(siteName)}. You received it because of an action on your account or an order you placed.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:14px;">${esc(label)}</a>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:8px 0;border-bottom:1px solid ${BORDER};font-size:14px;color:${MUTED};">${esc(label)}</td><td style="padding:8px 0;border-bottom:1px solid ${BORDER};font-size:14px;color:#111827;font-weight:600;text-align:right;">${esc(value)}</td></tr>`;
}

export interface OrderReceiptData {
  siteName: string;
  logoUrl?: string;
  customerName: string;
  orderNo: number | string;
  productName: string;
  quantity: number;
  total: number;
  paymentMethod: string;
  txid: string;
  trackUrl: string;
}

export function orderReceiptEmail(d: OrderReceiptData) {
  const subject = `Order #${d.orderNo} received — ${d.siteName}`;
  const methodLabel: Record<string, string> = {
    binance: "Binance Pay",
    usdt_bep20: "USDT (BEP-20)",
    usdt_trc20: "USDT (TRC-20)",
  };
  const inner = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;">Thanks for your order${d.customerName ? `, ${esc(d.customerName)}` : ""}!</h1>
    <p style="margin:0 0 18px;font-size:14px;color:${MUTED};">We've received your order and payment reference. Once payment is verified, your delivery will be ready.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      ${row("Order number", `#${d.orderNo}`)}
      ${row("Product", d.productName)}
      ${row("Quantity", String(d.quantity))}
      ${row("Total", money(d.total))}
      ${row("Payment method", methodLabel[d.paymentMethod] ?? d.paymentMethod)}
      ${row("Payment reference", d.txid)}
      ${row("Status", "Pending verification")}
    </table>
    <p style="margin:0 0 14px;font-size:14px;">Track your order anytime to see the status and retrieve your delivery:</p>
    ${btn(d.trackUrl, "Track my order")}
    <p style="margin:16px 0 0;font-size:13px;color:${MUTED};">Or visit ${esc(d.trackUrl)}</p>`;
  return { subject, html: shell(inner, d.siteName, d.logoUrl), text: `Order #${d.orderNo} received. ${d.quantity}x ${d.productName} — ${money(d.total)}. Track: ${d.trackUrl}` };
}

export interface AdminNewOrderData {
  siteName: string;
  logoUrl?: string;
  orderNo: number | string;
  productName: string;
  quantity: number;
  total: number;
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  txid: string;
  adminUrl: string;
}

export function adminNewOrderEmail(d: AdminNewOrderData) {
  const subject = `🔔 New website order #${d.orderNo}`;
  const methodLabel: Record<string, string> = {
    binance: "Binance Pay",
    usdt_bep20: "USDT (BEP-20)",
    usdt_trc20: "USDT (TRC-20)",
  };
  const inner = `
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;">New website order</h1>
    <p style="margin:0 0 18px;font-size:14px;color:${MUTED};">A new order was placed on the website and needs payment verification.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      ${row("Order number", `#${d.orderNo}`)}
      ${row("Customer", d.customerName)}
      ${row("Email", d.customerEmail)}
      ${row("Product", d.productName)}
      ${row("Quantity", String(d.quantity))}
      ${row("Total", money(d.total))}
      ${row("Payment method", methodLabel[d.paymentMethod] ?? d.paymentMethod)}
      ${row("Payment reference", d.txid)}
    </table>
    ${btn(d.adminUrl, "Review in admin")}`;
  return { subject, html: shell(inner, d.siteName, d.logoUrl), text: `New website order #${d.orderNo}: ${d.quantity}x ${d.productName} = ${money(d.total)} from ${d.customerName} (${d.customerEmail}). Ref: ${d.txid}. Review: ${d.adminUrl}` };
}

export interface ResellerApprovedData {
  siteName: string;
  logoUrl?: string;
  name: string;
  panelUrl: string;
  apiDocsUrl: string;
  /** One-click sign-in / set-password link (Supabase action link). */
  signInUrl?: string;
  /** Temporary password when a brand-new account was created for them. */
  tempPassword?: string;
}

export function resellerApprovedEmail(d: ResellerApprovedData) {
  const subject = `You're approved as a ${d.siteName} reseller 🎉`;
  const cta = d.signInUrl ?? d.panelUrl;
  const inner = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;">Welcome aboard${d.name ? `, ${esc(d.name)}` : ""}!</h1>
    <p style="margin:0 0 16px;font-size:14px;color:${MUTED};">Your reseller application has been approved and your reseller account is ready. Use the button below to sign in and open your panel.</p>
    <p style="margin:0 0 18px;font-size:14px;">${btn(cta, d.signInUrl ? "Sign in to your reseller panel" : "Open reseller panel")}</p>
    ${
      d.tempPassword
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;">
      ${row("Temporary password", d.tempPassword)}
    </table>
    <p style="margin:0 0 16px;font-size:13px;color:${MUTED};">Please change this password from your panel after your first sign-in.</p>`
        : `<p style="margin:0 0 16px;font-size:13px;color:${MUTED};">The link above signs you in directly and lets you set a new password. It expires after a while — you can always sign in at ${esc(d.panelUrl)}.</p>`
    }
    <p style="margin:0 0 6px;font-size:14px;">Need the API docs?</p>
    <p style="margin:0;font-size:13px;color:${BRAND_DARK};"><a href="${esc(d.apiDocsUrl)}" style="color:${BRAND_DARK};">${esc(d.apiDocsUrl)}</a></p>`;
  return {
    subject,
    html: shell(inner, d.siteName, d.logoUrl),
    text: `You're approved as a ${d.siteName} reseller!\nSign in: ${cta}${d.tempPassword ? `\nTemporary password: ${d.tempPassword}` : ""}\nPanel: ${d.panelUrl}\nAPI docs: ${d.apiDocsUrl}`,
  };
}

export interface TestEmailData {
  siteName: string;
  logoUrl?: string;
}

export function testEmail(d: TestEmailData) {
  const when = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const inner = `
    <h1 style="margin:0 0 12px 0;font-size:20px;color:${BRAND_DARK};">Email delivery is working ✅</h1>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;">This is a test message sent from the ${esc(d.siteName)} admin panel to confirm that Resend delivery, your sender domain and DNS records (SPF / DKIM) are configured correctly.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;">
      ${row("Sent at", when)}
      ${row("Source", "Admin → Settings → Email delivery")}
    </table>
    <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.6;">If this landed in spam, re-check the SPF, DKIM and DMARC records for your sending domain.</p>`;
  return {
    subject: `${d.siteName} — test email`,
    html: shell(inner, d.siteName, d.logoUrl),
    text: `Email delivery is working.\n\nThis is a test message from the ${d.siteName} admin panel.\nSent at: ${when}`,
  };
}
