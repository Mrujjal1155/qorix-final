/* Site-wide editable content. Every value is stored in the `bot_settings`
   key/value table under a `site_*` key, so admins can edit everything. */

export const SITE_DEFAULTS: Record<string, string> = {
  site_brand_name: "QORIX",
  site_brand_suffix: ".shop",
  site_tagline: "Premium digital products and subscriptions at unbeatable prices.",

  // Header
  site_nav: "Home|/\nAbout Us|/about\nProducts|/store\nFAQ|/faq\nContact Us|/contact",

  // Footer columns — one item per line: Label|href
  site_footer_categories_title: "Categories",
  site_footer_categories:
    "AI & Education Tools|/store\nDating & Lifestyle|/store\nGaming & Top-Up|/store\nGift Cards|/store\nMusic & Audio|/store",
  site_footer_categories_more: "View All|/store",

  site_footer_quick_title: "Quick Links",
  site_footer_quick: "Home|/\nAbout Us|/about\nProducts|/store\nCart|/store\nWrite Review|/contact",

  site_footer_support_title: "Support",
  site_footer_support: "Contact Us|/contact\nFAQ|/faq\nBecome a Reseller|/reseller\nAPI Documentation|/reseller/docs\nRefund Policy|/refund\nTerms of Service|/terms\nPrivacy Policy|/privacy",

  site_footer_contact_title: "Contact",
  site_contact_email: "support@qorixlab.com",
  site_contact_phone: "+8801860036852",
  site_contact_address: "Chattogram, Bangladesh",
  // one per line: Label|Value|link(optional)|icon(mail|phone|whatsapp|map|telegram|clock)
  // empty → built automatically from the email/phone/address fields above
  site_footer_contact_items: "",

  // Socials — one per line: Name|url  (facebook / instagram / telegram / twitter / whatsapp)
  site_socials:
    "facebook|https://facebook.com\ninstagram|https://instagram.com\ntelegram|https://t.me/vibexAcademybd\ntwitter|https://twitter.com",

  // Payment chips — one per line: Label|#bgColor|#textColor|imageURL(image optional)
  site_payments:
    "bKash|#e2136e\nNagad|#f60\nBINANCE|#0b0e11|#f0b90b\nUddoktaPay|#00a8ff\nNOWPayments|#0b1b2b\nskrill|#862165\nRocket|#8c3494\nUBA|#111\neasypay|#f5820b\nUPI|#1b1b1b",
  site_payments_label: "We accept:",

  site_copyright: "© {year} qorixlab.com. All rights reserved. Made with ❤️ in Bangladesh.",

  // Floating buttons
  site_whatsapp: "https://wa.me/8801860036852",
  site_whatsapp_icon: "", // optional image URL for the floating WhatsApp button
  site_brand_logo: "", // optional uploaded logo (empty = bundled QORIX logo)
  site_favicon: "", // browser tab icon (empty = bundled QORIX favicon)
  site_apple_icon: "", // iOS home-screen icon (empty = favicon)
  site_og_image: "", // social share image (empty = bundled QORIX share image)
  site_show_scrolltop: "1",

  // ── Pages (all editable from /admin/site) ─────────────────────────
  site_page_about_title: "About {brand}",
  site_page_about_body:
    "We are a digital goods store focused on premium AI tools, creative apps, streaming and productivity subscriptions. Order from the website or straight from our Telegram bot — the catalogue, prices and delivery are the same everywhere.",
  // one per line: Title|Text
  site_page_about_points:
    "Genuine products|Every subscription is sourced legitimately and tested before delivery.\nInstant delivery|Automatic stock is delivered the moment your payment is verified.\nWarranty included|Replacement warranty on every eligible order — no questions asked.\n24/7 support|Real humans on Telegram, ready whenever you need help.",

  site_page_faq_title: "Frequently asked questions",
  site_page_faq_sub: "Payment, delivery, warranty and support — answered.",
  // one per line: Question|Answer
  site_page_faq_items:
    "How do I pay?|We accept Binance Pay and USDT (BEP-20 / TRC-20). Pick a method at checkout, send the exact amount and paste the transaction ID.\nHow fast is delivery?|Automatic products are delivered instantly after the payment is verified. Manual products are delivered by our team, usually within a few hours.\nWhere do I get my credentials?|On the tracking page, in your account order history, and on Telegram if you ordered through the bot.\nIs there a warranty?|Yes. Each product shows its own warranty period on the product page. Contact support inside that period for a replacement.\nA product is out of stock — what now?|Tap “Notify Me When Available” on the product in our Telegram bot and we will message you the moment it is restocked.\nCan I get a refund?|If we cannot deliver a product you paid for, you get a full refund. Delivered credentials are non-refundable but are covered by the warranty.",

  site_page_contact_title: "Contact us",
  site_page_contact_sub: "The fastest way to reach us is Telegram — we reply around the clock.",
  // one per line: Title|Text|link(optional)|icon(telegram|chat|clock|track)
  site_page_contact_cards:
    "Telegram support|@vibexAcademybd — orders, delivery and warranty.|https://t.me/vibexAcademybd|telegram\nOrder bot|Buy and manage orders directly inside Telegram.|https://t.me/QORIX3_bot|chat\nSupport hours|24/7 — average reply time under 30 minutes.||clock\nOrder status|Check delivery anytime on the Track Order page.|/track|track",

  site_page_terms_title: "Terms of Service",
  site_page_terms_body:
    "By using {brand} you agree to these terms.\n\n1. Products\nWe sell digital subscriptions and accounts. Delivery happens on the website, on the tracking page, or inside our Telegram bot.\n\n2. Payments\nPayments are accepted through the methods shown at checkout. Orders are processed after the transaction is verified.\n\n3. Usage\nAccounts are for personal use only. Sharing, reselling or abusing credentials voids the warranty.\n\n4. Changes\nWe may update these terms at any time; the latest version is always published on this page.",

  site_page_privacy_title: "Privacy Policy",
  site_page_privacy_body:
    "Your privacy matters to us.\n\n1. Data we collect\nWe store your name, email and Telegram ID only to process orders and deliver products.\n\n2. How we use it\nOrder processing, delivery, warranty support and restock notifications. We never sell your data.\n\n3. Security\nPayments are verified through transaction IDs; we never ask for your card or wallet password.\n\n4. Contact\nMessage our support any time to review or delete your stored data.",

  site_page_refund_title: "Refund Policy",
  site_page_refund_body:
    "We want every order to be risk-free.\n\n1. Full refund\nIf we cannot deliver a product you paid for, you receive a full refund through the same payment method.\n\n2. Delivered products\nDelivered credentials are non-refundable, but they are covered by the warranty shown on the product page.\n\n3. How to claim\nContact support on Telegram with your order ID and we will review it within 24 hours.",
};

export type SiteContent = Record<string, string>;

export function siteValue(site: SiteContent | undefined, key: string): string {
  const v = site?.[key];
  return v == null || v === "" ? (SITE_DEFAULTS[key] ?? "") : v;
}

export type SiteLink = { label: string; href: string; extra?: string };

export function parseLinks(raw: string): SiteLink[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", href = "", extra = ""] = line.split("|").map((p) => p.trim());
      return { label, href: href || "#", extra };
    })
    .filter((l) => l.label);
}

export function siteLinks(site: SiteContent | undefined, key: string): SiteLink[] {
  return parseLinks(siteValue(site, key));
}

/* Payment badges: one per line → Label|#bgColor|#textColor|imageURL(optional) */
export type SitePayment = { label: string; bg: string; color: string; image: string };

export function sitePayments(site: SiteContent | undefined): SitePayment[] {
  return siteValue(site, "site_payments")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", bg = "", color = "", image = ""] = line.split("|").map((p) => p.trim());
      return { label, bg, color, image };
    })
    .filter((p) => p.label || p.image);
}

/* Page "cards"/"points" lists: one per line → Title|Text|link(optional)|icon(optional) */
export type SiteCard = { title: string; text: string; link: string; icon: string };

export function siteCards(site: SiteContent | undefined, key: string): SiteCard[] {
  return siteValue(site, key)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [title = "", text = "", link = "", icon = ""] = line.split("|").map((p) => p.trim());
      return { title, text, link, icon };
    })
    .filter((c) => c.title);
}

/* Footer contact rows: one per line → Label|Value|link(optional)|icon(optional).
   Falls back to the legacy email/phone/address keys when the list is empty. */
export type SiteContact = { label: string; value: string; link: string; icon: string };

export function siteContacts(site: SiteContent | undefined): SiteContact[] {
  const raw = siteValue(site, "site_footer_contact_items");
  if (raw.trim()) {
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [label = "", value = "", link = "", icon = ""] = line.split("|").map((p) => p.trim());
        return { label, value, link, icon: icon || "mail" };
      })
      .filter((c) => c.value || c.label);
  }
  const out: SiteContact[] = [];
  const email = siteValue(site, "site_contact_email");
  const phone = siteValue(site, "site_contact_phone");
  const address = siteValue(site, "site_contact_address");
  if (email) out.push({ label: "Email Support", value: email, link: `mailto:${email}`, icon: "mail" });
  if (phone)
    out.push({
      label: "WhatsApp",
      value: phone,
      link: `https://wa.me/${phone.replace(/[^0-9]/g, "")}`,
      icon: "whatsapp",
    });
  if (address) out.push({ label: "Address", value: address, link: "", icon: "map" });
  return out;
}
