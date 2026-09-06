import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listSupplierProducts,
  listSuppliers,
  saveSupplier,
  syncSupplier,
  testSupplier,
  updateSupplierProduct,
} from "@/lib/supplier.functions";
import { getCatalogue, listBotProducts, normalizeFeatured, setFeaturedRank } from "@/lib/admin.functions";
import { AdminShell, money } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/suppliers")({
  head: () => ({
    meta: [
      { title: "Supplier APIs — Shop Bot Admin" },
      {
        name: "description",
        content: "Sync external reseller API catalogues, set your markup and list products in the bot and website.",
      },
      { property: "og:title", content: "Supplier APIs — Shop Bot Admin" },
      { property: "og:description", content: "External API catalogue, markup and auto-listing controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const qc = useQueryClient();
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchProducts = useServerFn(listSupplierProducts);
  const fetchCatalogue = useServerFn(getCatalogue);
  const save = useServerFn(saveSupplier);
  const test = useServerFn(testSupplier);
  const sync = useServerFn(syncSupplier);
  const update = useServerFn(updateSupplierProduct);

  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => fetchSuppliers() });
  const [active, setActive] = useState<string>("");
  const supplierId = active || (suppliers?.[0]?.id ?? "");
  const supplier = (suppliers ?? []).find((s: any) => s.id === supplierId);

  const { data: rows } = useQuery({
    queryKey: ["supplier-products", supplierId],
    queryFn: () => fetchProducts({ data: { supplier_id: supplierId } }),
    enabled: Boolean(supplierId),
  });
  const { data: catalogue } = useQuery({ queryKey: ["catalogue"], queryFn: () => fetchCatalogue() });

  const [view, setView] = useState<"suppliers" | "bot">("suppliers");
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "out">("all");
  const [busy, setBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [baseDraft, setBaseDraft] = useState("");

  const [nameFor, setNameFor] = useState("");
  if (supplier && nameFor !== supplier.id) {
    setNameFor(supplier.id);
    setNameDraft(supplier.name ?? "");
    setBaseDraft(supplier.base_url ?? "");
    setKeyDraft("");
  }



  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["supplier-products"] });
  };

  const rowMut = useMutation({
    mutationFn: (vars: any) => update({ data: vars }),
    onSuccess: () => {
      refresh();
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onTest() {
    setBusy(true);
    try {
      const r = await test({ data: { id: supplierId } });
      r.ok ? toast.success(r.message) : toast.error(r.message);
    } finally {
      setBusy(false);
    }
  }

  async function onSync() {
    setBusy(true);
    try {
      const r = await sync({ data: { id: supplierId } });
      r.ok ? toast.success(r.message) : toast.error(r.message);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  const filtered = (rows ?? []).filter((r: any) => {
    if (query && !r.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (stockFilter === "in" && r.stock <= 0) return false;
    if (stockFilter === "out" && r.stock > 0) return false;
    return true;
  });


  return (
    <AdminShell title="Supplier APIs" subtitle="External catalogues, your markup, automatic delivery">
      <div className="mb-4 flex w-fit rounded-lg border border-border bg-background p-1">
        {(["suppliers", "bot"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "suppliers" ? "Supplier catalogue" : "My bot · all products"}
          </button>
        ))}
      </div>

      {view === "suppliers" && (
        <>
      <SyncHealthCard />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {suppliers && suppliers.length === 0 && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No supplier found. Run <code>db/2026-08-30_suppliers.sql</code> once in your Supabase SQL
              editor, then reload this page.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(suppliers ?? []).map((s: any) => (
              <Button
                key={s.id}
                size="sm"
                variant={s.id === supplierId ? "default" : "outline"}
                onClick={() => setActive(s.id)}
              >
                {s.name}
                {!s.is_enabled && <span className="ml-2 text-xs">(off)</span>}
              </Button>
            ))}
          </div>

          {supplier && (
            <div key={supplier.id} className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>Display name (shows everywhere)</Label>
                <div className="flex gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="e.g. Qamify"
                  />
                  <Button
                    variant="secondary"
                    disabled={!nameDraft.trim() || nameDraft.trim() === supplier.name}
                    onClick={async () => {
                      try {
                        await save({ data: { id: supplier.id, name: nameDraft.trim() } });
                        refresh();
                        toast.success(`Supplier name saved as “${nameDraft.trim()}”`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Save failed");
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This name is shown on orders, products and everywhere else.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Default markup %</Label>
                <Input
                  type="number"
                  step="0.01"
                  defaultValue={supplier.markup_percent ?? 0}
                  onBlur={(e) =>
                    save({ data: { id: supplier.id, markup_percent: Number(e.target.value) } }).then(refresh)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Default markup fixed ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  defaultValue={supplier.markup_fixed ?? 0}
                  onBlur={(e) =>
                    save({ data: { id: supplier.id, markup_fixed: Number(e.target.value) } }).then(refresh)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>API key</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={keyDraft}
                    placeholder={supplier.api_key ? "•••••• (saved)" : "paste supplier API key"}
                    onChange={(e) => setKeyDraft(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={!keyDraft.trim()}
                    onClick={async () => {
                      try {
                        await save({ data: { id: supplier.id, api_key: keyDraft.trim() } });
                        setKeyDraft("");
                        refresh();
                        toast.success("API key saved");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Save failed");
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>API base URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={baseDraft}
                    onChange={(e) => setBaseDraft(e.target.value)}
                    placeholder="https://panel.example.com"
                  />
                  <Button
                    variant="secondary"
                    disabled={!baseDraft.trim() || baseDraft.trim() === (supplier.base_url ?? "")}
                    onClick={async () => {
                      try {
                        await save({ data: { id: supplier.id, base_url: baseDraft.trim().replace(/\/+$/, "") } });
                        refresh();
                        toast.success("Base URL saved");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Save failed");
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Supplier panel address only, no /v1 or endpoint at the end.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Connection</Label>
                <Button
                  variant={supplier.is_enabled ? "default" : "outline"}
                  className="w-full"
                  onClick={async () => {
                    try {
                      await save({ data: { id: supplier.id, is_enabled: !supplier.is_enabled } });
                      refresh();
                      toast.success(supplier.is_enabled ? "Supplier turned off" : "Supplier turned on");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Save failed");
                    }
                  }}
                >
                  {supplier.is_enabled ? "On" : "Off"}
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" disabled={busy} onClick={onTest}>
                  Test
                </Button>
                <Button disabled={busy} onClick={onSync}>
                  Sync catalogue
                </Button>
              </div>


              <p className="sm:col-span-4 text-xs text-muted-foreground">
                {supplier.last_status ?? "Not synced yet"}
                {supplier.last_synced_at ? ` · ${new Date(supplier.last_synced_at).toLocaleString()}` : ""}
                {" · API key: "}
                {supplier.api_key ? "saved in database" : "from secret"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Supplier catalogue ({filtered.length})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border bg-background p-1">
              {(["all", "in", "out"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setStockFilter(key)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    stockFilter === key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {key === "all" ? "All" : key === "in" ? "In stock" : "Out of stock"}
                </button>
              ))}
            </div>
            <Input
              className="max-w-44"
              placeholder="Search by name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Product</th>
                <th>API price</th>
                <th>Stock</th>
                <th>Markup %</th>
                <th>+ Fixed</th>
                <th>Fixed price</th>
                <th>Sell price</th>
                <th>Category</th>
                <th className="text-right">Listed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-t border-border align-middle">
                  <td className="max-w-[16rem] py-2">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">#{r.external_id}</p>
                  </td>
                  <td>{money(r.cost_price)}</td>
                  <td>
                    <span
                      title={
                        r.stock <= 0
                          ? "Out of stock"
                          : r.stock < 10
                            ? "Low stock — restock soon"
                            : "Healthy stock"
                      }
                      className={`inline-flex min-w-9 items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        r.stock < 10
                          ? "border-destructive/40 bg-destructive/15 text-destructive"
                          : "border-success/45 bg-success/15 text-success"
                      }`}
                    >
                      {r.stock}
                    </span>
                  </td>


                  <td>
                    <Input
                      className="w-20"
                      type="number"
                      step="0.01"
                      defaultValue={r.markup_percent ?? ""}
                      placeholder="def"
                      onBlur={(e) =>
                        rowMut.mutate({
                          id: r.id,
                          markup_percent: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <Input
                      className="w-20"
                      type="number"
                      step="0.01"
                      defaultValue={r.markup_fixed ?? ""}
                      placeholder="def"
                      onBlur={(e) =>
                        rowMut.mutate({
                          id: r.id,
                          markup_fixed: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <Input
                      className="w-24"
                      type="number"
                      step="0.01"
                      defaultValue={r.price_override ?? ""}
                      placeholder="auto"
                      onBlur={(e) =>
                        rowMut.mutate({
                          id: r.id,
                          price_override: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="font-semibold">{money(r.sell_price)}</td>
                  <td>
                    <select
                      className="h-9 w-36 rounded-md border border-input bg-background px-2 text-sm"
                      defaultValue=""
                      onChange={(e) => rowMut.mutate({ id: r.id, category_id: e.target.value || null })}
                    >
                      <option value="">— keep —</option>
                      {(catalogue?.categories ?? []).map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant={r.is_listed ? "default" : "outline"}
                      onClick={() => rowMut.mutate({ id: r.id, is_listed: !r.is_listed })}
                    >
                      {r.is_listed ? "On" : "Off"}
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    No products yet — press “Sync catalogue”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
        </>
      )}

      {view === "bot" && <BotProductsPanel />}
    </AdminShell>
  );
}

/* ------------------------------------------------------------------------- */
/* Every product the bot sells (in-house + all suppliers) with pin ordering.  */

function BotProductsPanel() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listBotProducts);
  const setRank = useServerFn(setFeaturedRank);
  const renumber = useServerFn(normalizeFeatured);

  const { data: products } = useQuery({ queryKey: ["bot-products"], queryFn: () => fetchAll() });
  const [search, setSearch] = useState("");
  const [only, setOnly] = useState<"all" | "pinned" | "inhouse" | "supplier">("all");

  const refresh = () => qc.invalidateQueries({ queryKey: ["bot-products"] });

  const rankMut = useMutation({
    mutationFn: (vars: { id: string; featured_rank: number }) => setRank({ data: vars }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (products ?? []).filter((p: any) => {
    if (search && !String(p.name).toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (only === "pinned" && !(Number(p.featured_rank) > 0)) return false;
    if (only === "inhouse" && p.is_supplier) return false;
    if (only === "supplier" && !p.is_supplier) return false;
    return true;
  });
  const pinnedCount = (products ?? []).filter((p: any) => Number(p.featured_rank) > 0).length;
  const nextRank = pinnedCount + 1;

  return (
    <Card>
      <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>My bot · all products ({rows.length})</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            When pinned, it appears at that position on the first page of the bot shop. 1 = first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-background p-1">
            {(["all", "pinned", "inhouse", "supplier"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setOnly(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  only === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {key === "all" ? "All" : key === "pinned" ? `Pinned (${pinnedCount})` : key === "inhouse" ? "In-house" : "Supplier"}
              </button>
            ))}
          </div>
          <Input
            className="max-w-44"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const r = await renumber({});
              refresh();
              toast.success(`Renumbered ${r.count} pinned products`);
            }}
          >
            Fix serials
          </Button>
        </div>
      </CardHeader>

      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="w-24 py-2">Serial</th>
              <th>Product</th>
              <th>Source</th>
              <th>Price</th>
              <th>Stock</th>
              <th className="text-right">Pinned</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: any) => {
              const pinned = Number(p.featured_rank) > 0;
              return (
                <tr key={p.id} className="border-t border-border align-middle">
                  <td className="py-2">
                    <Input
                      className="w-20"
                      type="number"
                      min={0}
                      key={`${p.id}-${p.featured_rank}`}
                      defaultValue={pinned ? p.featured_rank : ""}
                      placeholder="—"
                      onBlur={(e) => {
                        const next = e.target.value === "" ? 0 : Number(e.target.value);
                        if (next !== Number(p.featured_rank)) rankMut.mutate({ id: p.id, featured_rank: next });
                      }}
                    />
                  </td>
                  <td className="max-w-[18rem]">
                    <p className="truncate font-medium">
                      {p.emoji ?? "📦"} {p.name}
                    </p>
                    {!p.is_active && <p className="text-xs text-muted-foreground">inactive</p>}
                  </td>
                  <td>
                    <Badge variant={p.is_supplier ? "secondary" : "outline"}>{p.source}</Badge>
                  </td>
                  <td>{money(p.price)}</td>
                  <td>
                    <span
                      className={`inline-flex min-w-9 items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        p.delivery_type === "manual"
                          ? "border-border bg-muted text-muted-foreground"
                          : p.stock < 10
                            ? "border-destructive/40 bg-destructive/15 text-destructive"
                            : "border-success/45 bg-success/15 text-success"
                      }`}
                    >
                      {p.delivery_type === "manual" ? "man" : p.stock}
                    </span>
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant={pinned ? "default" : "outline"}
                      onClick={() =>
                        rankMut.mutate({ id: p.id, featured_rank: pinned ? 0 : nextRank })
                      }
                    >
                      {pinned ? "On" : "Off"}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
