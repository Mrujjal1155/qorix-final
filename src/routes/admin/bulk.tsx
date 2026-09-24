import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { deleteBulkDiscount, listBulkDiscounts, saveBulkDiscount } from "@/lib/bulk-discount.functions";
import { applyTier, type BulkTier } from "@/lib/bulk-discount";
import { AdminShell, money } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";

export const Route = createFileRoute("/admin/bulk")({
  head: () => ({
    meta: [
      { title: "Bulk Discount — Admin" },
      { name: "description", content: "Set quantity-based bulk discounts for Telegram bot and API users." },
      { property: "og:title", content: "Bulk Discount — Admin" },
      { property: "og:description", content: "Quantity-based bulk discount rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BulkPage,
});

type Form = {
  id?: string;
  name: string;
  product_ids: string[];
  channel: "bot" | "api" | "both";
  tiers: BulkTier[];
  is_active: boolean;
  notify: boolean;
};

const empty = (): Form => ({
  name: "",
  product_ids: [],
  channel: "both",
  tiers: [{ min_qty: 5, type: "percent", value: 10 }],
  is_active: true,
  notify: true,
});

const CH: Record<string, string> = { bot: "Telegram bot", api: "API users", both: "Bot + API" };

function BulkPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listBulkDiscounts);
  const save = useServerFn(saveBulkDiscount);
  const del = useServerFn(deleteBulkDiscount);
  const { data } = useQuery({ queryKey: ["bulk"], queryFn: () => fetchAll() });
  const [f, setF] = useState<Form>(empty());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const products = data?.products ?? [];
  const byId = useMemo(() => Object.fromEntries(products.map((p: any) => [p.id, p])), [products]);
  const shown = products.filter((p: any) => p.name.toLowerCase().includes(search.toLowerCase()));
  const sample = byId[f.product_ids[0]];

  function setTier(i: number, patch: Partial<BulkTier>) {
    setF({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  }

  async function submit() {
    if (!f.product_ids.length) return toast.error("Select at least one product");
    setBusy(true);
    try {
      const r = await save({
        data: { ...f, tiers: f.tiers.map((t) => ({ ...t, min_qty: Number(t.min_qty), value: Number(t.value) })) },
      });
      toast.success(f.notify ? `Saved — ${r.announced} notification(s) sent` : "Saved");
      setF(empty());
      qc.invalidateQueries({ queryKey: ["bulk"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this bulk discount?")) return;
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["bulk"] });
    toast.success("Deleted");
  }

  return (
    <AdminShell title="Bulk Discount">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{f.id ? "Edit bulk discount" : "New bulk discount"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Name (optional)</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Lovable bulk" />
            </div>

            <div className="space-y-1.5">
              <Label>Products ({f.product_ids.length} selected)</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" />
              <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
                {shown.map((p: any) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={f.product_ids.includes(p.id)}
                      onCheckedChange={(v) =>
                        setF({
                          ...f,
                          product_ids: v ? [...f.product_ids, p.id] : f.product_ids.filter((x) => x !== p.id),
                        })
                      }
                    />
                    <span className="flex-1 truncate">{p.name}</span>
                    {!p.is_active && <Badge variant="outline">Off</Badge>}
                    <span className="text-muted-foreground">{money(p.price)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Where it applies</Label>
              <div className="flex flex-wrap gap-2">
                {(["bot", "api", "both"] as const).map((c) => (
                  <Button key={c} type="button" size="sm" variant={f.channel === c ? "default" : "outline"} onClick={() => setF({ ...f, channel: c })}>
                    {CH[c]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Discount tiers</Label>
              {f.tiers.map((t, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">From</span>
                  <Input type="number" min={1} className="w-20" value={t.min_qty} onChange={(e) => setTier(i, { min_qty: Number(e.target.value) })} />
                  <span className="text-sm text-muted-foreground">pcs →</span>
                  <Input type="number" min={0} step="0.01" className="w-24" value={t.value} onChange={(e) => setTier(i, { value: Number(e.target.value) })} />
                  <div className="flex">
                    <Button type="button" size="sm" variant={t.type === "percent" ? "default" : "outline"} onClick={() => setTier(i, { type: "percent" })}>%</Button>
                    <Button type="button" size="sm" variant={t.type === "flat" ? "default" : "outline"} onClick={() => setTier(i, { type: "flat" })}>$ / pc</Button>
                  </div>
                  <Button type="button" size="icon" variant="ghost" disabled={f.tiers.length === 1} onClick={() => setF({ ...f, tiers: f.tiers.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setF({ ...f, tiers: [...f.tiers, { min_qty: (f.tiers.at(-1)?.min_qty ?? 1) + 5, type: "percent", value: 15 }] })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add tier
              </Button>
              <p className="text-xs text-muted-foreground">Flat = fixed amount off each piece. Bulk discount is off while a product is in a flash sale. Price never goes below $0.01.</p>
            </div>

            {sample && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="mb-1 font-medium">Preview: {sample.name}</div>
                {[...f.tiers].sort((a, b) => a.min_qty - b.min_qty).map((t, i) => (
                  <div key={i}>
                    {t.min_qty}+ pcs → {money(applyTier(Number(sample.price), { ...t, min_qty: Number(t.min_qty), value: Number(t.value) }))} each
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm"><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} /> Active</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={f.notify} onCheckedChange={(v) => setF({ ...f, notify: v })} /> Send notification</label>
            </div>

            <div className="flex gap-2">
              <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Submit"}</Button>
              {f.id && <Button variant="outline" onClick={() => setF(empty())}>Cancel</Button>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bulk discounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data?.rules.length && <p className="text-sm text-muted-foreground">No bulk discount yet.</p>}
            {data?.rules.map((r: any) => (
              <div key={r.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium">{r.name || "Bulk discount"}</span>
                  <Badge variant={r.is_active ? "default" : "outline"}>{r.is_active ? "Active" : "Off"}</Badge>
                  <Badge variant="secondary">{CH[r.channel] ?? r.channel}</Badge>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {(r.product_ids ?? []).map((id: string) => byId[id]?.name ?? "—").join(", ")}
                </div>
                <div className="mt-1">
                  {(r.tiers ?? []).map((t: any) => `${t.min_qty}+ → ${t.type === "flat" ? `$${t.value}/pc` : `${t.value}%`}`).join(" · ")}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setF({ id: r.id, name: r.name, product_ids: r.product_ids ?? [], channel: r.channel, tiers: r.tiers ?? [], is_active: r.is_active, notify: false })}>
                    <Pencil className="mr-1 h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
