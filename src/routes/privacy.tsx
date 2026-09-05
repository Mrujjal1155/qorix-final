import { createFileRoute } from "@tanstack/react-router";
import { SiteTextPage } from "@/components/SiteTextPage";
import { productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — qorixlab.com" },
      { name: "description", content: "How qorixlab.com collects, uses and protects your personal data." },
      { property: "og:title", content: "Privacy Policy — qorixlab.com" },
      { property: "og:description", content: "How we collect, use and protect your personal data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: productionUrlFor("/privacy") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/privacy") }],
  }),
  component: () => <SiteTextPage titleKey="site_page_privacy_title" bodyKey="site_page_privacy_body" />,
});
