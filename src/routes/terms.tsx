import { createFileRoute } from "@tanstack/react-router";
import { SiteTextPage } from "@/components/SiteTextPage";
import { productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — qorixlab.com" },
      { name: "description", content: "Terms and conditions for ordering and using digital products from qorixlab.com." },
      { property: "og:title", content: "Terms of Service — qorixlab.com" },
      { property: "og:description", content: "Terms and conditions for ordering and using digital products." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: productionUrlFor("/terms") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/terms") }],
  }),
  component: () => <SiteTextPage titleKey="site_page_terms_title" bodyKey="site_page_terms_body" />,
});
