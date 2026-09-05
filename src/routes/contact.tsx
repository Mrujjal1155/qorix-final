import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, MessageCircle, PackageSearch, Send, type LucideIcon } from "lucide-react";
import { StoreShell } from "@/components/StoreShell";
import { useSiteContent } from "@/lib/use-site-content";
import { siteCards, type SiteCard } from "@/lib/site-content";
import { productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact qorixlab.com — 24/7 Telegram Support" },
      {
        name: "description",
        content: "Reach the qorixlab.com team on Telegram for orders, delivery issues, warranty claims and pre-sale questions.",
      },
      { property: "og:title", content: "Contact qorixlab.com" },
      { property: "og:description", content: "Talk to our support team on Telegram, any time of day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/contact") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/contact") }],
  }),
  component: ContactPage,
});

const CARD_ICONS: Record<string, LucideIcon> = {
  telegram: Send,
  chat: MessageCircle,
  clock: Clock,
  track: PackageSearch,
};

function ContactCard({ card }: { card: SiteCard }) {
  const Icon = CARD_ICONS[card.icon] ?? MessageCircle;
  const body = (
    <>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{card.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{card.text}</p>
    </>
  );
  const cls = "rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/60";
  if (!card.link) return <div className={cls}>{body}</div>;
  if (/^https?:\/\//i.test(card.link))
    return (
      <a href={card.link} target="_blank" rel="noreferrer" className={cls}>
        {body}
      </a>
    );
  return (
    <Link to={card.link as never} className={cls}>
      {body}
    </Link>
  );
}

function ContactPage() {
  const { site, v } = useSiteContent();
  const cards = siteCards(site, "site_page_contact_cards");

  return (
    <StoreShell>
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">{v("site_page_contact_title")}</h1>
        <p className="mt-3 text-muted-foreground">{v("site_page_contact_sub")}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {cards.map((c, i) => (
            <ContactCard key={`${c.title}-${i}`} card={c} />
          ))}
        </div>
      </section>
    </StoreShell>
  );
}
