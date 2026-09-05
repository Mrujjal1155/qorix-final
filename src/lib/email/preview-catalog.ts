/**
 * Catalogue of every email this app actually sends. Client-safe metadata only
 * (no secrets, no template rendering) so the admin panel can list the emails
 * and request a rendered preview from the server.
 */

export type EmailTemplateId = "order_receipt" | "admin_new_order" | "reseller_approved" | "test";

export interface EmailTemplateMeta {
  id: EmailTemplateId;
  label: string;
  recipient: string;
  trigger: string;
  contains: string;
  /** bot_settings toggle key that switches this email on/off (if any). */
  toggleKey?: string;
}

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateMeta[] = [
  {
    id: "order_receipt",
    label: "Order receipt",
    recipient: "Customer",
    trigger: "Right after a website order is submitted at checkout",
    contains: "Order number, product, quantity, total, payment method & reference, status and the order tracking link",
    toggleKey: "email_receipt_enabled",
  },
  {
    id: "admin_new_order",
    label: "New order — admin notification",
    recipient: "Admin notification address",
    trigger: "A new website order arrives and needs payment verification",
    contains: "Order number, customer name & email, product, quantity, total, payment method, reference and a link to the admin orders page",
    toggleKey: "email_admin_notify_enabled",
  },
  {
    id: "reseller_approved",
    label: "Reseller approved",
    recipient: "Reseller applicant",
    trigger: "An admin approves a reseller application",
    contains: "Welcome message, sign-in link to the reseller panel, temporary password (new accounts only) and the API docs link",
    toggleKey: "email_reseller_enabled",
  },
  {
    id: "test",
    label: "Delivery test",
    recipient: "Any address you enter",
    trigger: "You press “Send test email” in Email settings",
    contains: "Confirmation that the API key, sender domain and SPF/DKIM records work",
  },
];
