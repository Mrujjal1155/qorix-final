import { createFileRoute } from "@tanstack/react-router";
import { StoreShell } from "@/components/StoreShell";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useSiteContent } from "@/lib/use-site-content";
import { siteCards } from "@/lib/site-content";
import { productionUrlFor } from "@/lib/site-url";
import { BOT_FAQ } from "@/lib/telegram-bot";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — QORIX Store Orders, Payment, Delivery & Telegram Bot" },
      {
        name: "description",
        content: "Answers about payment methods, delivery, warranty, refunds and the QORIX Telegram bot @QORIX3_bot.",
      },
      { property: "og:title", content: "FAQ — QORIX Store" },
      { property: "og:description", content: "Everything about payment, delivery, warranty and support." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/faq") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/faq") }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: BOT_FAQ.map((f) => ({ "@type": "Question", name: f.title, acceptedAnswer: { "@type": "Answer", text: f.text } })),
        }),
      },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  const { site, v } = useSiteContent();
  const saved = siteCards(site, "site_page_faq_items");
  const faqs = [...saved, ...BOT_FAQ.filter((b) => !saved.some((s) => s.title === b.title))];

  return (
    <StoreShell>
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">{v("site_page_faq_title")}</h1>
        <p className="mt-3 text-muted-foreground">{v("site_page_faq_sub")}</p>

        <Accordion type="single" collapsible className="mt-8">
          {faqs.map((f, i) => (
            <AccordionItem key={`${f.title}-${i}`} value={`${f.title}-${i}`}>
              <AccordionTrigger className="text-left">{f.title}</AccordionTrigger>
              <AccordionContent className="whitespace-pre-line text-muted-foreground">{f.text}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </StoreShell>
  );
}
