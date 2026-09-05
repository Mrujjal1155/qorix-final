import { createFileRoute } from "@tanstack/react-router";
import { SiteTextPage } from "@/components/SiteTextPage";
import { productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — qorixlab.com" },
      { name: "description", content: "Refund and warranty rules for digital product orders on qorixlab.com." },
      { property: "og:title", content: "Refund Policy — qorixlab.com" },
      { property: "og:description", content: "Refund and warranty rules for digital product orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: productionUrlFor("/refund") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/refund") }],
  }),
  component: () => <SiteTextPage titleKey="site_page_refund_title" bodyKey="site_page_refund_body" />,
});
