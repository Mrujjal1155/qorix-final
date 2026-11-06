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
        sameAs: [`${PRODUCTION_SITE_URL}/`, "https://t.me/QORIX3_bot"],
        logo: productionUrlFor("/favicon.png"),
        image: productionUrlFor("/og-image.png"),
        description:
          "QORIX STORE sells digital subscriptions — AI, developer, SEO, streaming, VPN and creative apps — with automatic delivery after payment on the website and in the Telegram bot @QORIX3_bot.",
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

/** "$min – $max" (USD) from the live catalogue's prices; null when no priced products. */
export function catalogPriceRange(products: Array<{ price?: number | string | null }>): string | null {
  const prices = products.map((p) => Number(p.price)).filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) return null;
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}

/** Store JSON-LD (Organization + OnlineStore) carrying the live catalogue price range. */
export function storeJsonLd(priceRange: string | null) {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${PRODUCTION_SITE_URL}/#store`,
    name: "QORIX STORE",
    url: `${PRODUCTION_SITE_URL}/`,
    parentOrganization: { "@id": ORGANIZATION_ID },
    currenciesAccepted: "USD",
    ...(priceRange ? { priceRange } : {}),
  };
}

/** Product meta description that leads with the product's own name so shared templates stay distinct. */
export function productMetaDescription(name: string, description: string): string {
  const body = description.replace(/\p{Extended_Pictographic}|\uFE0F/gu, " ").replace(/\s+/g, " ").trim();
  return metaText(body ? `${name}: ${body}` : "");
}
