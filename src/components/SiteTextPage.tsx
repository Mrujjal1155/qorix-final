import { useMemo } from "react";
import { StoreShell } from "@/components/StoreShell";
import { useSiteContent } from "@/lib/use-site-content";
import { ShieldCheck, FileText, CalendarDays, ListChecks, Mail, MessageCircle } from "lucide-react";

type Block = { heading: string | null; lines: string[] };

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseBody(body: string): Block[] {
  return body
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const lines = raw.split("\n");
      const first = (lines[0] ?? "").trim();
      const isHeading = /^\d+[.)]\s+\S/.test(first) || (/^[A-Z0-9]/.test(first) && first.endsWith(":"));
      if (isHeading) {
        return { heading: first.replace(/:$/, ""), lines: lines.slice(1).map((l) => l.trim()).filter(Boolean) };
      }
      return { heading: null, lines: lines.map((l) => l.trim()).filter(Boolean) };
    });
}

function Paragraphs({ lines }: { lines: string[] }) {
  const out: JSX.Element[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    out.push(
      <ul key={key} className="space-y-2 pl-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
            <span>{b}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((line, i) => {
    if (/^[-•*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-•*]\s+/, ""));
      return;
    }
    flush(`ul-${i}`);
    out.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {line}
      </p>,
    );
  });
  flush("ul-end");
  return <div className="space-y-3">{out}</div>;
}

/* Generic admin-editable legal / text page (Terms, Privacy, Refund…).
   Blank line = new block. A block starting with "1. Title" becomes a numbered section.
   Lines starting with "- " inside a block become bullet points. */
export function SiteTextPage({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const { v } = useSiteContent();
  const brand = `${v("site_brand_name")}${v("site_brand_suffix")}`;
  const title = v(titleKey).replaceAll("{brand}", brand);
  const body = v(bodyKey).replaceAll("{brand}", brand);
  const updated = v("site_legal_updated");
  const email = v("site_contact_email");
  const telegram = v("site_socials")
    .split("\n")
    .map((l) => l.split("|"))
    .find((p) => (p[0] ?? "").trim().toLowerCase() === "telegram")?.[1]
    ?.trim();

  const blocks = useMemo(() => parseBody(body), [body]);
  const intro = blocks.filter((b) => !b.heading);
  const sections = blocks.filter((b) => b.heading);

  return (
    <StoreShell>
      <section className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-6 shadow-sm sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Legal
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
            {intro.length ? (
              <div className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {intro.map((b, i) => (
                  <Paragraphs key={i} lines={b.lines} />
                ))}
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {updated ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-3 py-1">
                  <CalendarDays className="h-3.5 w-3.5" /> Last updated: {updated}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-3 py-1">
                <FileText className="h-3.5 w-3.5" /> {sections.length} sections
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-3 py-1">
                {brand}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
          {/* Table of contents */}
          {sections.length ? (
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <ListChecks className="h-4 w-4" /> On this page
                </p>
                <nav className="mt-3 space-y-1">
                  {sections.map((s) => (
                    <a
                      key={s.heading}
                      href={`#${slugify(s.heading!)}`}
                      className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      {s.heading}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          ) : null}

          {/* Sections */}
          <div className="space-y-4">
            {sections.map((s, i) => (
              <article
                key={s.heading}
                id={slugify(s.heading!)}
                className="scroll-mt-24 rounded-2xl border border-border/70 bg-card/50 p-5 transition-colors hover:border-primary/40 sm:p-6"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold tracking-tight sm:text-lg">
                      {s.heading!.replace(/^\d+[.)]\s*/, "")}
                    </h2>
                    <div className="mt-2 text-sm text-muted-foreground">
                      <Paragraphs lines={s.lines} />
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {/* Contact strip */}
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6">
              <h2 className="text-base font-bold tracking-tight">Questions about this policy?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Our support team replies around the clock — reach out any time and we will help.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {telegram ? (
                  <a
                    href={telegram}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                  >
                    <MessageCircle className="h-4 w-4" /> Telegram support
                  </a>
                ) : null}
                {email ? (
                  <a
                    href={`mailto:${email}`}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm font-semibold transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <Mail className="h-4 w-4" /> {email}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </StoreShell>
  );
}
