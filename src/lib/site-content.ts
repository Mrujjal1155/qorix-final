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

  site_copyright: "© {year} qorixlab.com. All rights reserved. Made with ❤️ in Bangladesh.",

  // Floating buttons
  site_whatsapp_enabled: "1", // 1 = show floating WhatsApp button, 0 = hide
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

  site_legal_updated: "September 2026",
  site_page_terms_title: "Terms of Service",
  site_page_terms_body:
    "These Terms of Service govern your use of {brand} and every order placed through our website, our Telegram bot and our reseller API. By placing an order you confirm that you accept these terms.\n\n1. About us\n{brand} is a digital goods store. We sell subscriptions, licences, top-ups and account access for AI tools, developer tools, SEO tools, design, streaming and VPN services. All items are digital \u2014 nothing is shipped physically.\n\n2. Eligibility\n- You must be at least 18 years old, or have permission from a parent or legal guardian.\n- You must provide a valid email address and, where required, a valid Telegram account so we can deliver your order and provide warranty support.\n- One person may not create multiple accounts to abuse promotions, referral rewards or warranty claims.\n\n3. Orders and pricing\n- All prices are shown in USD unless a different currency is selected; converted prices are indicative and the USD amount is final.\n- Prices, stock and delivery times can change at any time without notice. The price shown at the moment of checkout is the price that applies to your order.\n- An order is confirmed only after payment is verified. We may cancel and fully refund an order if the item becomes unavailable, if the listed price was clearly incorrect, or if we suspect fraud.\n\n4. Payments\n- We accept the payment methods listed at checkout, including Binance Pay and USDT (BEP-20 / TRC-20), plus wallet balance where available.\n- You must send the exact amount and submit the correct transaction ID. Payments that cannot be matched are marked unpaid and the order is cancelled automatically after the time shown on the payment page.\n- Chargebacks or reversed crypto payments after delivery are treated as fraud and may lead to a permanent ban.\n\n5. Delivery\n- Automatic products are delivered instantly once payment is verified, on the website, on the Track Order page and in our Telegram bot.\n- Manual products are delivered by our team, normally within a few hours.\n- Delivery details are always available in your order history, so losing a message never means losing your product.\n\n6. Warranty and fair use\n- Every product page shows its own warranty period. Within that period we replace a product that stops working through no fault of your own.\n- Warranty is void if you change the email, password or recovery details of a delivered account, share it with others, resell it without a reseller agreement, or use it in a way that breaks the provider's own rules.\n- Accounts and keys are for the buyer's own use. Reselling requires an approved reseller account.\n\n7. Acceptable use\nYou agree not to use {brand} for unlawful activity, not to attempt to access our systems or other customers' data, not to abuse our API or bot with automated traffic, and not to publish or resell our delivered credentials publicly.\n\n8. Account suspension\nWe may suspend or ban an account that breaks these terms, abuses refunds or referrals, or attempts payment fraud. Remaining wallet balance obtained legitimately can be refunded on request after review.\n\n9. Liability\nOur services are provided \"as is\". We are not responsible for a third-party provider changing, restricting or ending its own service. Our total liability for any order is limited to the amount you paid for that order.\n\n10. Changes to these terms\nWe may update these terms at any time. The current version is always published on this page, and the date at the top shows when it was last changed.\n\n11. Contact\nQuestions about these terms can be sent to our support team on Telegram or by email; we answer around the clock.",

  site_page_privacy_title: "Privacy Policy",
  site_page_privacy_body:
    "This Privacy Policy explains what information {brand} collects, why we collect it, how long we keep it and what rights you have. We only collect what we genuinely need to sell and deliver digital products.\n\n1. Information we collect\n- Account details: name, email address and, if you use our bot, your Telegram ID and username.\n- Order details: products purchased, amount, currency, payment method, transaction ID and delivery status.\n- Support messages: tickets and chats you send us, so we can help with warranty and delivery.\n- Technical data: basic log data such as request time and error messages, used to keep the service secure and working.\n\n2. What we never collect\nWe never ask for and never store card numbers, bank logins, wallet seed phrases or exchange passwords. Crypto payments are verified with a public transaction ID only.\n\n3. How we use your information\n- To process payments, deliver orders and show your order history.\n- To provide warranty, replacement and support.\n- To send order, delivery, restock and account notifications you asked for.\n- To detect and prevent fraud, duplicate refunds and abuse of referrals.\n- To improve our catalogue, pricing and service quality.\n\n4. Legal basis\nWe process your data to perform the contract you enter when you place an order, to comply with legal obligations, and on the basis of our legitimate interest in preventing fraud and securing the platform.\n\n5. Sharing with third parties\n- We never sell your personal data.\n- We share only the minimum required with our payment verification providers, our suppliers when a product must be provisioned for you, and our hosting and database providers.\n- We may disclose information where we are legally required to do so.\n\n6. Cookies and local storage\nWe use essential cookies and browser storage to keep you signed in, remember your cart, currency, language and theme. We do not use them to build advertising profiles.\n\n7. Data retention\nOrder and transaction records are kept for as long as required for accounting, warranty and fraud prevention. Support messages are kept while your account is active. You can ask us to delete data that we are not legally required to retain.\n\n8. Your rights\nYou can request a copy of your data, ask for a correction, ask for deletion, or withdraw consent for notifications. Contact support and we will respond within a reasonable time after verifying your identity.\n\n9. Security\nData is stored on managed, access-controlled infrastructure with row-level security. Access is limited to staff who need it, admin actions are logged, and balances and deliveries are handled by protected database operations.\n\n10. Children\nOur service is not intended for anyone under 18, and we do not knowingly collect their data.\n\n11. Changes and contact\nIf this policy changes, the new version is published here with an updated date. For any privacy request, contact our support team on Telegram or by email.",

  site_page_refund_title: "Refund Policy",
  site_page_refund_body:
    "We want every order to be risk-free. This policy explains exactly when a refund is issued, how quickly, and what happens with delivered digital products.\n\n1. Full refund \u2014 undelivered orders\nIf we cannot deliver a product you have paid for, you receive a 100% refund. You can choose store wallet credit, which is instant, or a refund to your original payment method.\n\n2. Refund for faulty products\nIf a delivered product does not work on arrival, report it within 24 hours with proof. We first replace it; if no replacement is available, we refund the full amount.\n\n3. Warranty replacements\nEach product page shows its own warranty period. If the product stops working inside that period through no fault of your own, we replace it free of charge. Replacement is the primary remedy during the warranty window.\n\n4. Delivered products\nWorking credentials, keys and top-ups that have already been delivered cannot be returned, because a digital product cannot be taken back once it is revealed. They remain covered by the warranty above.\n\n5. When a refund is not possible\n- The account details were changed by you (email, password or recovery data).\n- The product was shared, resold without a reseller agreement, or used against the provider's rules.\n- The warranty period has ended.\n- The wrong product was bought on purpose, or the claim is fraudulent or duplicated.\n\n6. Cancelled and unpaid orders\nOrders that are not paid within the time shown on the payment page are cancelled automatically and nothing is charged. If money was already deducted from your wallet, it is returned to your wallet immediately.\n\n7. How to claim\n- Contact support on Telegram or by email with your order ID.\n- Include a short description and a screenshot or video of the problem.\n- We review every claim within 24 hours; most are resolved much faster.\n\n8. Processing time\nWallet refunds are instant. Crypto refunds are sent within 24 hours of approval and arrive after network confirmation. The refund always goes back to the same wallet or method used to pay.\n\n9. Chargebacks\nPlease contact us before opening a dispute. Chargebacks filed after a successful delivery are treated as fraud and result in a permanent ban.\n\n10. Contact\nOur support team is available 24/7 for refund and warranty questions.",
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
