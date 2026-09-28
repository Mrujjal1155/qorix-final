import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { deleteUserPrice, listUserPrices, saveUserPrice, searchBotUsers } from "@/lib/user-prices.functions";
import { AdminShell, money } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/admin/user-prices")({
  head: () => ({
    meta: [
      { title: "Custom User Prices — Admin" },
      { name: "description", content: "Give a specific Telegram bot user a custom price per product with a minimum quantity." },
      { property: "og:title", content: "Custom User Prices — Admin" },
      { property: "og:description", content: "Per-user, per-product custom pricing for bot users." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UserPricesPage,
});

const userLabel = (u: any) => (u?.username ? `@${u.username}` : u?.first_name || String(u?.telegram_id ?? ""));

function UserPricesPage() {
  const qc = useQueryClient();
  const fetchAll = useServerFn(listUserPrices);
  const search = useServerFn(searchBotUsers);
  const save = useServerFn(saveUserPrice);
  const del = useServerFn(deleteUserPrice);
  const { data } = useQuery({ queryKey: ["user-prices"], queryFn: () => fetchAll() });

  const [productId, setProductId] = useState("");
  const [pSearch, setPSearch] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [price, setPrice] = useState("");
  const [minQty, setMinQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const products = data?.products ?? [];
  const byId = useMemo(() => Object.fromEntries(products.map((p: any) => [p.id, p])), [products]);
  const users = useMemo(() => Object.fromEntries((data?.users ?? []).map((u: any) => [String(u.telegram_id), u])), [data]);
  const product = productId ? byId[productId] : null;
  const shownProducts = products.filter((p: any) => p.name.toLowerCase().includes(pSearch.toLowerCase())).slice(0, 50);
  const existing = (data?.rows ?? []).find(
    (r: any) => user && r.product_id === productId && String(r.telegram_id) === String(user.telegram_id),
  );

  async function doSearch() {
    if (!q.trim()) return;
    try {
      const r = await search({ data: { q } });
      setFound(r);
      if (!r.length) toast.error("No bot user found");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function submit() {
    if (!product || !user) return;
    const pr = Number(price);
    const mq = Math.floor(Number(minQty));
    if (!(pr >= 0) || price === "") return toast.error("Enter a valid price");
    if (!(mq >= 1)) return toast.error("Minimum quantity must be at least 1");
    setBusy(true);
    try {
      await save({ data: { telegram_id: Number(user.telegram_id), product_id: product.id, price: pr, min_qty: mq } });
      toast.success("Custom price saved");
      qc.invalidateQueries({ queryKey: ["user-prices"] });
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
      qc.invalidateQueries({ queryKey: ["user-prices"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <AdminShell title="Custom User Prices">
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
            <CardTitle>2. Find bot user</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {user ? (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{userLabel(user)}</div>
                  <div className="text-sm text-muted-foreground">Telegram ID {user.telegram_id}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setUser(null)} aria-label="Change user">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="@username or Telegram ID"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  />
                  <Button onClick={doSearch}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                {found.map((u) => (
                  <button
                    key={u.telegram_id}
                    className="flex w-full justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => { setUser(u); setFound([]); }}
                  >
                    <span>{userLabel(u)} {u.first_name && u.username ? `· ${u.first_name}` : ""}</span>
                    <span className="text-muted-foreground">{u.telegram_id}</span>
                  </button>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {product && user && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>3. Custom price for {userLabel(user)}</CardTitle>
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
              Below the minimum the user pays the normal price. With a custom price, bulk and membership discounts don't apply; coupons still work.
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
                    <th className="py-2">User</th>
                    <th>Product</th>
                    <th>Normal</th>
                    <th>Custom</th>
                    <th>Min qty</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((r: any) => {
                    const u = users[String(r.telegram_id)] ?? { telegram_id: r.telegram_id };
                    const p = byId[r.product_id];
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="py-2">{userLabel(u)}</td>
                        <td>{p?.name ?? "—"}</td>
                        <td>{p ? money(Number(p.price)) : "—"}</td>
                        <td className="font-medium">{money(Number(r.price))}</td>
                        <td>{r.min_qty}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => { setUser(u); setProductId(r.product_id); setPrice(String(r.price)); setMinQty(String(r.min_qty)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
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
