import type { ReactNode } from "react";

/** Editorial section header: numbered label, display headline, optional one-liner and right-side action. */
export function SectionHeader({
  index,
  label,
  title,
  lead,
  action,
  align = "left",
}: {
  index: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  align?: "left" | "split";
}) {
  return (
    <header className="mb-8 border-t hairline pt-5 sm:mb-10">
      <div className={`grid gap-4 ${align === "split" ? "md:grid-cols-12 md:items-end" : "sm:flex sm:items-end sm:justify-between"}`}>
        <div className={align === "split" ? "md:col-span-7" : "max-w-2xl"}>
          <p className="eyebrow">
            <span className="text-primary">{index}</span> — {label}
          </p>
          <h2 className="mt-3 text-3xl leading-[1.05] sm:text-4xl">{title}</h2>
        </div>
        {(lead || action) && (
          <div className={`flex flex-col gap-3 ${align === "split" ? "md:col-span-5 md:items-end md:text-right" : "sm:items-end sm:text-right"}`}>
            {lead ? <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{lead}</p> : null}
            {action}
          </div>
        )}
      </div>
    </header>
  );
}
