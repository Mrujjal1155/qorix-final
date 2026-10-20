import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getTelegramTopProducts, saveTelegramTopProducts } from "@/lib/telegram-top-products.functions";

type Product = { id: string; name: string; price: number; stock?: number; is_active: boolean; owner_reseller_id?: string | null };

export function TelegramTopProducts({ products }: { products: Product[] }) {
  const qc = useQueryClient();
  const load = useServerFn(getTelegramTopProducts);
  const save = useServerFn(saveTelegramTopProducts);
  const { data, isPending, error } = useQuery({ queryKey: ["telegram-top-products"], queryFn: () => load() });
  const [draft, setDraft] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const ids = draft ?? data?.product_ids ?? [];
  const catalogue = products.filter((p) => !p.owner_reseller_id);
  const visible = catalogue.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const mutation = useMutation({
    mutationFn: () => save({ data: { product_ids: ids.filter((id) => catalogue.some((p) => p.id === id)) } }),
    onSuccess: (result) => {
      qc.setQueryData(["telegram-top-products"], result);
      setDraft(null);
      toast.success("Top products saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (id: string, checked: boolean) => setDraft(checked ? [...ids, id] : ids.filter((x) => x !== id));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{ids.length} selected</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={isPending || !!error || mutation.isPending || !ids.length} onClick={() => setDraft([])}><X className="size-4" /> Clear selection</Button>
          <Button disabled={isPending || !!error || mutation.isPending} onClick={() => mutation.mutate()}><Save className="size-4" /> {mutation.isPending ? "Saving…" : "Save Top Products"}</Button>
        </div>
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search top products" className="pl-9" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">Could not load top products. <Button variant="link" onClick={() => qc.invalidateQueries({ queryKey: ["telegram-top-products"] })}>Retry</Button></p> : isPending ? <p className="text-sm text-muted-foreground">Loading top products…</p> : (
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-border border-y border-border">
          {visible.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 py-3">
              <Checkbox aria-label={`Select ${p.name}`} checked={ids.includes(p.id)} disabled={mutation.isPending} onCheckedChange={(checked) => toggle(p.id, checked === true)} />
              <span className="min-w-0 flex-1 break-words text-sm font-medium">{p.name}</span>
              {!p.is_active && <span className="text-xs text-muted-foreground">Off</span>}
              <span className="shrink-0 text-sm text-muted-foreground">${Number(p.price).toFixed(2)} · {p.stock ?? 0} items</span>
            </label>
          ))}
          {!visible.length && <p className="py-6 text-sm text-muted-foreground">No products found.</p>}
        </div>
      )}
    </section>
  );
}