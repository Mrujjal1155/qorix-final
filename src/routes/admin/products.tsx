import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type CSSProperties } from "react";
import { Filter, Search } from "lucide-react";
import {
  applyProductIcon,
  deleteCategory,
  deleteProduct,
  getBotSettings,
  getCatalogue,
  getCategoryProducts,
  saveCategory,
  saveCategoryProducts,
  saveProduct,
} from "@/lib/admin.functions";

import { AdminShell, money } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploadField } from "@/components/ImageUploadField";
import { StockManagerCard } from "@/components/StockManagerCard";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/products")({
  head: () => ({
    meta: [
      { title: "Products & Stock — Shop Bot Admin" },
      { name: "description", content: "Create categories and products and bulk upload delivery stock for the Telegram shop bot." },
      { property: "og:title", content: "Products & Stock — Shop Bot Admin" },
      { property: "og:description", content: "Manage your digital catalogue and credential stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

const EMPTY = {
  id: undefined as string | undefined,
  name: "",
  emoji: "📦",
  telegram_custom_emoji_id: "",
  description: "",
  important_note: "",
  quick_guide: "",
  details: [] as { label: string; value: string }[],
  price: 0,
  old_price: "" as string | number,
  image_url: "",
  delivery_time: "",
  badge: "",
  delivery_type: "auto" as "auto" | "manual",
  manual_note: "",
  category_id: "",
  is_active: true,
  sort_order: 0,
};

function supplierChipStyle(key: string): CSSProperties {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return {
    backgroundColor: `color-mix(in oklch, oklch(0.62 0.19 ${h}) 22%, transparent)`,
    color: `oklch(0.72 0.17 ${h})`,
    borderColor: `color-mix(in oklch, oklch(0.62 0.19 ${h}) 45%, transparent)`,
  };
}

function ProductsPage() {
  const qc = useQueryClient();
  const fetchCatalogue = useServerFn(getCatalogue);
  const { data } = useQuery({ queryKey: ["catalogue"], queryFn: () => fetchCatalogue() });

  const saveCat = useServerFn(saveCategory);
  const delCat = useServerFn(deleteCategory);
  const saveProd = useServerFn(saveProduct);
  const delProd = useServerFn(deleteProduct);

  const [cat, setCat] = useState({ name: "", emoji: "📁", channel: "both" });
  const [manageCat, setManageCat] = useState<string>("");
  const [manageSearch, setManageSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const loadCatProducts = useServerFn(getCategoryProducts);
  const saveCatProducts = useServerFn(saveCategoryProducts);

  const openManager = async (id: string) => {
    if (manageCat === id) {
      setManageCat("");
      return;
    }
    setManageCat(id);
    setManageSearch("");
    try {
      const r: any = await loadCatProducts({ data: { category_id: id } });
      setPicked(r?.product_ids ?? []);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const assignMut = useMutation({
    mutationFn: () => saveCatProducts({ data: { category_id: manageCat, product_ids: picked } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      toast.success(`Saved — ${r?.count ?? picked.length} product(s) in this category`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [form, setForm] = useState({ ...EMPTY });
  const [stockFor, setStockFor] = useState<string>("");
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.products ?? []).filter((p: any) => {
      if (supplierFilter === "inhouse" && p.supplier_id) return false;
      if (supplierFilter !== "all" && supplierFilter !== "inhouse" && p.supplier_id !== supplierFilter) return false;
      if (!q) return true;
      return (
        String(p.name ?? "").toLowerCase().includes(q) ||
        String(p.supplier_name ?? "").toLowerCase().includes(q) ||
        String(p.badge ?? "").toLowerCase().includes(q)
      );
    });
  }, [data?.products, search, supplierFilter]);


  const fetchSettings = useServerFn(getBotSettings);
  const settingsQ = useQuery({ queryKey: ["bot-settings-icons"], queryFn: () => fetchSettings() });
  const storedIcon = String((settingsQ.data as any)?.ui_icon_prod_icon_default ?? "");
  const [icon, setIcon] = useState<{ emoji: string; id: string; scope: string } | null>(null);
  const iconState = icon ?? {
    emoji: /^\d{8,}\|/.test(storedIcon) ? storedIcon.split("|")[1] || "📦" : storedIcon || "📦",
    id: /^\d{8,}/.test(storedIcon) ? storedIcon.split("|")[0]! : "",
    scope: "missing",
  };
  const applyIcon = useServerFn(applyProductIcon);
  const iconMut = useMutation({
    mutationFn: () =>
      applyIcon({
        data: {
          emoji: iconState.emoji,
          custom_emoji_id: iconState.id || null,
          scope: iconState.scope as "default_only" | "missing" | "supplier" | "all",
        },
      }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["bot-settings-icons"] });
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      toast.success(`Icon saved${r?.updated ? ` — ${r.updated} product(s) updated` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["catalogue"] });


  const catMut = useMutation({
    mutationFn: () => saveCat({ data: { name: cat.name, emoji: cat.emoji, channel: cat.channel } }),
    onSuccess: () => {
      setCat({ name: "", emoji: "📁", channel: "both" });
      refresh();
      toast.success("Category saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prodMut = useMutation({
    mutationFn: () =>
      saveProd({
        data: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name,
          emoji: form.emoji,
          telegram_custom_emoji_id: form.telegram_custom_emoji_id || null,
          description: form.description,
          important_note: form.important_note,
          quick_guide: form.quick_guide,
          details: form.details,
          price: Number(form.price),
          old_price: form.old_price === "" ? null : Number(form.old_price),
          delivery_type: form.delivery_type,
          image_url: form.image_url,
          delivery_time: form.delivery_time,
          badge: form.badge,
          manual_note: form.manual_note,
          category_id: form.category_id || null,
          is_active: form.is_active,
          sort_order: Number(form.sort_order),
        },
      }),
    onSuccess: () => {
      setForm({ ...EMPTY });
      refresh();
      toast.success("Product saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <AdminShell title="Products & Stock">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                className="w-16"
                value={cat.emoji}
                onChange={(e) => setCat({ ...cat, emoji: e.target.value })}
              />
              <Input
                placeholder="Category name"
                value={cat.name}
                onChange={(e) => setCat({ ...cat, name: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <select
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                value={cat.channel}
                onChange={(e) => setCat({ ...cat, channel: e.target.value })}
              >
                <option value="both">Both (Telegram + Website)</option>
                <option value="telegram">Telegram only</option>
                <option value="website">Website only</option>
              </select>
              <Button onClick={() => catMut.mutate()} disabled={!cat.name}>
                Add
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {(data?.categories ?? []).map((c: any) => (
                <li key={c.id} className="rounded-md bg-muted px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span>
                      {c.emoji} {c.name}
                      <Badge variant="secondary" className="ml-2">{c.channel ?? "both"}</Badge>
                    </span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => openManager(c.id)}>
                        {manageCat === c.id ? "Close" : "Manage products"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => delCat({ data: { id: c.id } }).then(refresh)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                  {manageCat === c.id && (
                    <div className="mt-3 space-y-2">
                      <Input
                        placeholder="Search products…"
                        value={manageSearch}
                        onChange={(e) => setManageSearch(e.target.value)}
                      />
                      <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                        {manageList.map((p: any) => (
                          <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                            <input
                              type="checkbox"
                              checked={picked.includes(p.id)}
                              onChange={(e) =>
                                setPicked((prev) =>
                                  e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                                )
                              }
                            />
                            <span className="flex-1 truncate">
                              {p.emoji} {p.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {p.supplier_name ?? "In-house"}
                            </span>
                          </label>
                        ))}
                        {manageList.length === 0 && (
                          <p className="px-1 py-2 text-xs text-muted-foreground">No products match this search.</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{picked.length} selected</span>
                        <Button size="sm" onClick={() => assignMut.mutate()} disabled={assignMut.isPending}>
                          Save
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{form.id ? "Edit product" : "New product"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Emoji</Label>
              <Input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Telegram Premium custom emoji ID (optional)</Label>
              <Input
                inputMode="numeric"
                value={form.telegram_custom_emoji_id}
                onChange={(e) => setForm({ ...form, telegram_custom_emoji_id: e.target.value.trim() })}
                placeholder="Telegram custom emoji ID"
              />
            </div>
            <div className="space-y-1">
              <Label>Price</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Old price (optional)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.old_price}
                onChange={(e) => setForm({ ...form, old_price: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">— none —</option>
                {(data?.categories ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Delivery type</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.delivery_type}
                onChange={(e) => setForm({ ...form, delivery_type: e.target.value as "auto" | "manual" })}
              >
                <option value="auto">Auto (from stock)</option>
                <option value="manual">Manual (admin delivers)</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Website image — upload or URL (Telegram keeps using the emoji)</Label>
              <ImageUploadField
                value={form.image_url}
                onChange={(url) => setForm({ ...form, image_url: url })}
                placeholder="https://…/product.jpg"
              />
            </div>
            <div className="space-y-1">
              <Label>Delivery time text</Label>
              <Input
                value={form.delivery_time}
                onChange={(e) => setForm({ ...form, delivery_time: e.target.value })}
                placeholder="30 min delivery"
              />
            </div>
            <div className="space-y-1">
              <Label>Badge (optional)</Label>
              <Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="HOT" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Description / summary (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Must read the description first…"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Important note (optional)</Label>
              <Textarea
                rows={2}
                value={form.important_note}
                onChange={(e) => setForm({ ...form, important_note: e.target.value })}
                placeholder="Need Card to Activate."
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Quick guide / setup steps (optional)</Label>
              <Textarea
                rows={4}
                value={form.quick_guide}
                onChange={(e) => setForm({ ...form, quick_guide: e.target.value })}
                placeholder={"✅ Sign up at …\n✅ Go to Manage Account → Promocode…"}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Extra details (shown on the website product page)</Label>
              {form.details.map((d, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[220px_1fr_auto]">
                  <Input
                    value={d.label}
                    placeholder="Label (e.g. Warranty)"
                    onChange={(e) => {
                      const next = [...form.details];
                      next[i] = { ...next[i]!, label: e.target.value };
                      setForm({ ...form, details: next });
                    }}
                  />
                  <Textarea
                    rows={2}
                    value={d.value}
                    placeholder="Value / full text"
                    onChange={(e) => {
                      const next = [...form.details];
                      next[i] = { ...next[i]!, value: e.target.value };
                      setForm({ ...form, details: next });
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => setForm({ ...form, details: form.details.filter((_, x) => x !== i) })}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, details: [...form.details, { label: "", value: "" }] })}
              >
                + Add detail
              </Button>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={() => prodMut.mutate()} disabled={!form.name}>
                {form.id ? "Update product" : "Create product"}
              </Button>
              {form.id && (
                <Button variant="outline" onClick={() => setForm({ ...EMPTY })}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Product icons (Premium emoji)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label>Fallback emoji</Label>
            <Input
              value={iconState.emoji}
              onChange={(e) => setIcon({ ...iconState, emoji: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Telegram Premium custom emoji ID</Label>
            <Input
              inputMode="numeric"
              placeholder="5400280896311944960"
              value={iconState.id}
              onChange={(e) => setIcon({ ...iconState, id: e.target.value.trim() })}
            />
          </div>
          <div className="space-y-1">
            <Label>Apply to</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={iconState.scope}
              onChange={(e) => setIcon({ ...iconState, scope: e.target.value })}
            >
              <option value="default_only">Default only (new items)</option>
              <option value="missing">Products without an icon</option>
              <option value="supplier">All API/supplier products</option>
              <option value="all">All products</option>
            </select>
          </div>
          <div className="sm:col-span-4">
            <Button onClick={() => iconMut.mutate()} disabled={iconMut.isPending}>
              Save icon
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Products coming from the API have no icon of their own, so this default icon is shown as the Premium emoji in the bot.
            </p>
          </div>
        </CardContent>
      </Card>



      <Card className="mt-4">
        <CardHeader className="gap-3">
          <CardTitle>Catalogue</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="relative sm:w-64">
              <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <select
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
              >
                <option value="all">All suppliers</option>
                <option value="inhouse">In-house (admin)</option>
                {(data?.suppliers ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{filteredProducts.length} product(s)</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Product</th>
                <th>Source</th>
                <th>Price</th>
                <th>Delivery</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p: any) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <span>{p.emoji}</span>
                      )}
                      {p.name}
                    </span>
                  </td>
                  <td>
                    {p.supplier_id ? (
                      <Badge variant="outline" style={supplierChipStyle(String(p.supplier_id))}>
                        {p.supplier_name ?? "Supplier"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" style={supplierChipStyle("in-house")}>In-house</Badge>
                    )}
                  </td>
                  <td>
                    {money(p.price)}
                    {p.old_price ? <span className="ml-1 line-through text-muted-foreground">{money(p.old_price)}</span> : null}
                  </td>
                  <td>
                    <Badge variant="secondary">{p.delivery_type}</Badge>
                  </td>
                  <td>{p.delivery_type === "manual" ? "—" : p.stock}</td>
                  <td className="space-x-1 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setForm({
                          id: p.id,
                          name: p.name,
                          emoji: p.emoji ?? "📦",
                          telegram_custom_emoji_id: p.telegram_custom_emoji_id ?? "",
                          description: p.description ?? "",
                          important_note: p.important_note ?? "",
                          quick_guide: p.quick_guide ?? "",
                          details: Array.isArray((p as any).details) ? ((p as any).details as any[]).map((d) => ({ label: String(d?.label ?? ""), value: String(d?.value ?? "") })) : [],
                          price: Number(p.price),
                          old_price: p.old_price ?? "",
                          delivery_type: p.delivery_type,
                          image_url: p.image_url ?? "",
                          delivery_time: p.delivery_time ?? "",
                          badge: p.badge ?? "",
                          manual_note: p.manual_note ?? "",
                          category_id: p.category_id ?? "",
                          is_active: p.is_active,
                          sort_order: p.sort_order,
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setStockFor(p.id)}>
                      Stock
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => delProd({ data: { id: p.id } }).then(refresh)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {stockFor && (
        <StockManagerCard
          productId={stockFor}
          productName={(data?.products ?? []).find((p: any) => p.id === stockFor)?.name ?? "Product"}
          onClose={() => setStockFor("")}
        />
      )}

    </AdminShell>
  );
}
