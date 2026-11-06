import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, MessageCircle, PackageSearch, Send, type LucideIcon } from "lucide-react";
import { StoreShell } from "@/components/StoreShell";
import { useSiteContent } from "@/lib/use-site-content";
import { siteCards, type SiteCard } from "@/lib/site-content";
import { productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact QORIX Store — Telegram Support via @QORIX3_bot" },
      {
        name: "description",
        content: "Reach the QORIX Store team through @QORIX3_bot on Telegram for orders, delivery issues, warranty claims and pre-sale questions.",
      },
      { property: "og:title", content: "Contact QORIX Store" },
      { property: "og:description", content: "Message our support team through the Telegram bot @QORIX3_bot." },
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
        <p className="mt-8 text-sm text-muted-foreground">
          Shop and get support in Telegram:{" "}
          <a href="https://t.me/QORIX3_bot" target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">@QORIX3_bot</a>
          {" · "}
          <Link to="/telegram-bot" className="text-primary hover:underline">How the bot works</Link>
        </p>
      </section>
    </StoreShell>
  );
}
