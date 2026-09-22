import { PRODUCTION_SITE_URL, productionUrlFor } from "@/lib/site-url";

/** Strip markdown/HTML-ish noise and clamp to a meta-description length. */
export function metaText(input: string | null | undefined, max = 155): string {
  const clean = String(input ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/[\s,.;:-]+$/, "")}…`;
}

/** Absolute URL for a product image (falls back to the image proxy route). */
export function productImageUrl(id: string, imageUrl?: string | null): string {
  const raw = (imageUrl ?? "").trim();
  if (/^https?:\/\//.test(raw)) return raw;
  if (raw.startsWith("/")) return `${PRODUCTION_SITE_URL}${raw}`;
  return productionUrlFor(`/api/public/product-image/${id}`);
}

export const ORGANIZATION_ID = `${PRODUCTION_SITE_URL}/#organization`;
export const WEBSITE_ID = `${PRODUCTION_SITE_URL}/#website`;

/** Sitewide Organization + WebSite graph, used by Google and AI answer engines. */
export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: "QORIX STORE",
        alternateName: "qorixlab.com",
        url: `${PRODUCTION_SITE_URL}/`,
        logo: productionUrlFor("/favicon.png"),
        image: productionUrlFor("/og-image.png"),
        description:
          "QORIX STORE sells premium digital subscriptions — AI tools, VPN, streaming, creative and productivity apps — with instant automated delivery on the website and on Telegram.",
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            availableLanguage: ["en", "bn"],
            url: productionUrlFor("/contact"),
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: `${PRODUCTION_SITE_URL}/`,
        name: "QORIX STORE",
        publisher: { "@id": ORGANIZATION_ID },
        inLanguage: "en",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${PRODUCTION_SITE_URL}/store?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/** BreadcrumbList for a page trail of [name, path] pairs. */
export function breadcrumbJsonLd(trail: Array<[string, string]>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: productionUrlFor(path),
    })),
  };
}
