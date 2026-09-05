import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type HubSection = {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  render: () => ReactNode;
};

/* Tappable settings hub: a searchable card grid that opens one section at a time. */
export function SettingsHub({ sections }: { sections: HubSection[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const active = sections.find((s) => s.id === openId) ?? null;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return sections;
    return sections.filter(
      (s) => s.title.toLowerCase().includes(term) || s.description.toLowerCase().includes(term),
    );
  }, [q, sections]);

  if (active) {
    const Icon = active.icon;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setOpenId(null)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{active.title}</h2>
              <p className="truncate text-xs text-muted-foreground">{active.description}</p>
            </div>
          </div>
        </div>
        {active.render()}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search settings…"
          className="h-12 rounded-xl pl-10"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => {
          const Icon = s.icon;
          return (
            <Button
              key={s.id}
              type="button"
              variant="ghost"
              onClick={() => setOpenId(s.id)}
              className="group h-auto w-full justify-start rounded-2xl border border-border/70 bg-card p-4 text-left whitespace-normal transition hover:border-primary/50 hover:bg-card hover:shadow-lg"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold leading-tight">{s.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {s.description}
                </span>
              </span>
            </Button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No settings match “{q}”.</p>
        )}
      </div>
    </div>
  );
}
