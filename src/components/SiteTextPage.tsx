import { StoreShell } from "@/components/StoreShell";
import { useSiteContent } from "@/lib/use-site-content";

/* Generic admin-editable text page (Terms, Privacy, Refund…).
   Body supports blank-line separated paragraphs. */
export function SiteTextPage({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const { v } = useSiteContent();
  const brand = `${v("site_brand_name")}${v("site_brand_suffix")}`;
  const title = v(titleKey).replaceAll("{brand}", brand);
  const body = v(bodyKey).replaceAll("{brand}", brand);

  return (
    <StoreShell>
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
        <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground">
          {body.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>
      </section>
    </StoreShell>
  );
}
