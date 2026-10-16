import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { deleteResellerPrice, listResellerPrices, saveResellerPrice } from "@/lib/reseller-prices.functions";
import { AdminShell, money } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";

export const Route = createFileRoute("/admin/reseller-prices")({
  head: () => ({
    meta: [
      { title: "Custom Reseller Prices — Admin" },
      { name: "description", content: "Give a specific reseller a custom price per product with a minimum quantity." },
      { property: "og:title", content: "Custom Reseller Prices — Admin" },
      { property: "og:description", content: "Per-reseller, per-product custom pricing for the reseller API." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResellerPricesPage,
});

function ResellerPricesPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listResellerPrices);
  const save = useServerFn(saveResellerPrice);
  const del = useServerFn(deleteResellerPrice);
  const { data } = useQuery({ queryKey: ["reseller-prices"], queryFn: () => fetchAll() });

  const [productId, setProductId] = useState("");
  const [pSearch, setPSearch] = useState("");
  const [rSearch, setRSearch] = useState("");
  const [reseller, setReseller] = useState<any>(null);
  const [price, setPrice] = useState("");
  const [minQty, setMinQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const products = data?.products ?? [];
  const byId = useMemo(() => Object.fromEntries(products.map((p: any) => [p.id, p])), [products]);
  const resellersById = useMemo(
    () => Object.fromEntries((data?.resellers ?? []).map((r: any) => [r.id, r])),
    [data],
  );
  const product = productId ? byId[productId] : null;
  const shownProducts = products.filter((p: any) => p.name.toLowerCase().includes(pSearch.toLowerCase())).slice(0, 50);
  const shownResellers = (data?.resellers ?? [])
    .filter(
      (r: any) =>
        !rSearch ||
        r.name.toLowerCase().includes(rSearch.toLowerCase()) ||
        (r.email ?? "").toLowerCase().includes(rSearch.toLowerCase()),
    )
    .slice(0, 50);
  const existing = (data?.rows ?? []).find(
    (r: any) => reseller && r.product_id === productId && r.reseller_id === reseller.id,
  );

  async function submit() {
    if (!product || !reseller) return;
    const pr = Number(price);
    const mq = Math.floor(Number(minQty));
    if (!(pr >= 0) || price === "") { toast.error("Enter a valid price"); return; }
    if (!(mq >= 1)) { toast.error("Minimum quantity must be at least 1"); return; }
    setBusy(true);
    try {
      await save({ data: { reseller_id: reseller.id, product_id: product.id, price: pr, min_qty: mq } });
      toast.success("Custom price saved");
      qc.invalidateQueries({ queryKey: ["reseller-prices"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this custom price?")) return;
    try {
      await del({ data: { id } });
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["reseller-prices"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <AdminShell title="Custom Reseller Prices">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Select product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {product ? (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{product.name}</div>
                  <div className="text-sm text-muted-foreground">
                    Normal price {money(Number(product.price))} · {product.delivery_type} · {product.is_active ? "On" : "Off"}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setProductId("")} aria-label="Change product">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Input placeholder="Search product…" value={pSearch} onChange={(e) => setPSearch(e.target.value)} />
                <div className="max-h-72 overflow-auto rounded-md border">
                  {shownProducts.map((p: any) => (
                    <button
                      key={p.id}
                      className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                      onClick={() => setProductId(p.id)}
                    >
                      <span>{p.name}</span>
                      <span className="text-muted-foreground">{money(Number(p.price))}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Select reseller</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reseller ? (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{reseller.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {reseller.email ?? "No email"} · discount {Number(reseller.discount_percent)}%
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setReseller(null)} aria-label="Change reseller">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Input placeholder="Search reseller by name or email…" value={rSearch} onChange={(e) => setRSearch(e.target.value)} />
                <div className="max-h-72 overflow-auto rounded-md border">
                  {shownResellers.map((r: any) => (
                    <button
                      key={r.id}
                      className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                      onClick={() => setReseller(r)}
                    >
                      <span>
                        {r.name} {!r.is_active && <span className="text-muted-foreground">(disabled)</span>}
                      </span>
                      <span className="text-muted-foreground">{Number(r.discount_percent)}% off</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {product && reseller && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>3. Custom price for {reseller.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {product.name} — normal price {money(Number(product.price))}
              {existing ? ` · current custom price ${money(Number(existing.price))} from ${existing.min_qty} pcs` : ""}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Custom price (per item, USD)</Label>
                <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Minimum quantity to get this price</Label>
                <Input type="number" min="1" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Below the minimum the reseller pays their normal discounted price. With a custom price, the reseller's
              discount percent and bulk discounts don't apply — the custom price is final.
            </p>
            <Button onClick={submit} disabled={busy}>{existing ? "Update price" : "Save price"}</Button>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Saved custom prices</CardTitle>
        </CardHeader>
        <CardContent>
          {!(data?.rows ?? []).length ? (
            <p className="text-sm text-muted-foreground">No custom prices yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Reseller</th>
                    <th>Product</th>
                    <th>Normal</th>
                    <th>Custom</th>
                    <th>Min qty</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((r: any) => {
                    const rs = resellersById[r.reseller_id];
                    const p = byId[r.product_id];
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="py-2">{rs?.name ?? "—"}</td>
                        <td>{p?.name ?? "—"}</td>
                        <td>{p ? money(Number(p.price)) : "—"}</td>
                        <td className="font-medium">{money(Number(r.price))}</td>
                        <td>{r.min_qty}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => { setReseller(rs ?? { id: r.reseller_id, name: "Reseller" }); setProductId(r.product_id); setPrice(String(r.price)); setMinQty(String(r.min_qty)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
