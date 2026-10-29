import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getTelegramTopCategories, saveTelegramTopCategories } from "@/lib/telegram-top-products.functions";

type Category = { id: string; name: string; emoji?: string | null; is_active: boolean; sort_order?: number };

export function TelegramTopCategories({ categories }: { categories: Category[] }) {
  const qc = useQueryClient();
  const load = useServerFn(getTelegramTopCategories);
  const save = useServerFn(saveTelegramTopCategories);
  const { data, isPending, error } = useQuery({ queryKey: ["telegram-top-categories"], queryFn: () => load() });
  const [draft, setDraft] = useState<string[] | null>(null);
  const ids = draft ?? data?.category_ids ?? [];
  const list = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const mutation = useMutation({
    mutationFn: () => save({ data: { category_ids: ids.filter((id) => list.some((c) => c.id === id)) } }),
    onSuccess: (r) => { qc.setQueryData(["telegram-top-categories"], r); setDraft(null); toast.success("Top categories saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (id: string, on: boolean) => setDraft(on ? [...ids, id] : ids.filter((x) => x !== id));

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">Selected categories show at the top of the Telegram categories page, two big buttons per row, in the order you tick them.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{ids.length} selected</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={isPending || mutation.isPending || !ids.length} onClick={() => setDraft([])}><X className="size-4" /> Clear</Button>
          <Button disabled={isPending || !!error || mutation.isPending} onClick={() => mutation.mutate()}><Save className="size-4" /> {mutation.isPending ? "Saving…" : "Save Top Categories"}</Button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">Could not load top categories.</p> : isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-border border-y border-border">
          {list.map((c, i) => {
            const pos = ids.indexOf(c.id);
            return (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 py-3">
                <span className="w-8 shrink-0 text-xs text-muted-foreground">#{i + 1}</span>
                <Checkbox aria-label={`Select ${c.name}`} checked={pos >= 0} disabled={mutation.isPending} onCheckedChange={(v) => toggle(c.id, v === true)} />
                <span className="min-w-0 flex-1 break-words text-sm font-medium">{c.emoji ? `${c.emoji} ` : ""}{c.name}</span>
                {pos >= 0 && <span className="text-xs font-semibold text-primary">Top {pos + 1}</span>}
                {!c.is_active && <span className="text-xs text-muted-foreground">Off</span>}
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
