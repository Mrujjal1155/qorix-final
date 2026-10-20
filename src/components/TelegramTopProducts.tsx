import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { colorIndexesFor, supplierBadgeStyle } from "@/lib/supplier-colors";
import { IN_HOUSE_FILTER, countBySupplier, filterCatalogue } from "@/lib/telegram-top-products";
import { getTelegramTopProducts, saveTelegramTopProducts } from "@/lib/telegram-top-products.functions";
import { cn } from "@/lib/utils";

type Product = { id: string; name: string; price: number; stock?: number; is_active: boolean; owner_reseller_id?: string | null; supplier_name?: string | null };

export function TelegramTopProducts({ products }: { products: Product[] }) {
  const qc = useQueryClient();
  const load = useServerFn(getTelegramTopProducts);
  const save = useServerFn(saveTelegramTopProducts);
  const { data, isPending, error } = useQuery({ queryKey: ["telegram-top-products"], queryFn: () => load() });
  const [draft, setDraft] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState<string | null>(null);
  const ids = draft ?? data?.product_ids ?? [];
  const catalogue = products.filter((p) => !p.owner_reseller_id);
  const visible = useMemo(() => filterCatalogue(catalogue, { search, supplier }), [products, search, supplier]);
  const supplierColors = useMemo(() => colorIndexesFor(catalogue.map((p) => p.supplier_name)), [products]);
  const counts = useMemo(() => countBySupplier(catalogue), [products]);
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
  const chip = (name: string | null | undefined) => {
    const clean = String(name ?? "").trim();
    if (!clean) return <Badge variant="outline" className="text-[11px] text-muted-foreground">In-house</Badge>;
    return <Badge variant="outline" className="text-[11px]" style={supplierBadgeStyle(supplierColors.get(clean) ?? 0)}>{clean}</Badge>;
  };
  const filterChip = "h-6 px-2 text-[11px] font-semibold";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{ids.length} selected · {visible.length} shown</span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={isPending || !!error || mutation.isPending || !ids.length} onClick={() => setDraft([])}><X className="size-4" /> Clear selection</Button>
          <Button disabled={isPending || !!error || mutation.isPending} onClick={() => mutation.mutate()}><Save className="size-4" /> {mutation.isPending ? "Saving…" : "Save Top Products"}</Button>
        </div>
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search top products" className="pl-9" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {catalogue.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter products by supplier">
          <span className="text-xs text-muted-foreground">Supplier colours:</span>
          <Button variant="outline" size="sm" className={cn(filterChip, !supplier && "border-primary/70 text-primary")} aria-pressed={!supplier} onClick={() => setSupplier(null)}>
            All · {catalogue.length}
          </Button>
          {Array.from(supplierColors.keys()).map((name, i) => (
            <Button
              key={name}
              variant="outline"
              size="sm"
              className={cn(filterChip, supplier && supplier !== name && "opacity-50")}
              aria-pressed={supplier === name}
              onClick={() => setSupplier(supplier === name ? null : name)}
              style={supplierBadgeStyle(i)}
            >
              {name} · {counts.get(name) ?? 0}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className={cn(filterChip, "text-muted-foreground", supplier && supplier !== IN_HOUSE_FILTER && "opacity-50")}
            aria-pressed={supplier === IN_HOUSE_FILTER}
            onClick={() => setSupplier(supplier === IN_HOUSE_FILTER ? null : IN_HOUSE_FILTER)}
          >
            In-house · {counts.get(IN_HOUSE_FILTER) ?? 0}
          </Button>
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">Could not load top products. <Button variant="link" onClick={() => qc.invalidateQueries({ queryKey: ["telegram-top-products"] })}>Retry</Button></p> : isPending ? <p className="text-sm text-muted-foreground">Loading top products…</p> : (
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-border border-y border-border">
          {visible.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 py-3">
              <Checkbox aria-label={`Select ${p.name}`} checked={ids.includes(p.id)} disabled={mutation.isPending} onCheckedChange={(checked) => toggle(p.id, checked === true)} />
              <div className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium">{p.name}</span>
                <span className="mt-1 block">{chip(p.supplier_name)}</span>
              </div>
              {!p.is_active && <span className="text-xs text-muted-foreground">Off</span>}
              <span className="shrink-0 text-sm text-muted-foreground">${Number(p.price).toFixed(2)} · {p.stock ?? 0} items</span>
            </label>
          ))}
          {!visible.length && <p className="py-6 text-sm text-muted-foreground">No products match this filter.</p>}
        </div>
      )}
    </section>
  );
}
