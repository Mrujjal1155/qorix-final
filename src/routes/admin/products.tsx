import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Boxes, Filter, FolderTree, PlusCircle, Search, Sparkles } from "lucide-react";
import {
  applyProductIcon,
  deleteCategory,
  deleteProduct,
  getBotSettings,
  getCatalogue,
  getCategoryProducts,
  reorderCategories,
  saveCategory,
  saveCategoryProducts,
  saveProduct,
  setProductActive,
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
import { brandFallbackOnError } from "@/components/SmartImage";
import { Switch } from "@/components/ui/switch";

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
  price_override: "" as string | number,
  supplier_id: "" as string,
  image_url: "",
  delivery_time: "",
  badge: "",
  delivery_type: "auto" as "auto" | "manual",
  manual_note: "",
  category_id: "",
  is_active: true,
  sort_order: 0,
};

type View = "hub" | "categories" | "products" | "form" | "pricing";

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

  const [view, setView] = useState<View>("hub");
  const [cat, setCat] = useState({ name: "", emoji: "📁", channel: "both", image_url: "" });
  const [logoFor, setLogoFor] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
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
  /** Category serial — arrows move a category up/down; bot + website follow this order. */
  const reorderCats = useServerFn(reorderCategories);
  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => reorderCats({ data: { ids } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      toast.success("Category order saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function moveCategory(index: number, dir: -1 | 1) {
    const list = (data?.categories ?? []) as any[];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((c) => String(c.id));
    const moved = ids[index]!;
    ids[index] = ids[target]!;
    ids[target] = moved;
    reorderMut.mutate(ids);
  }

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

  const manageList = useMemo(() => {
    const q = manageSearch.trim().toLowerCase();
    const list = (data?.products ?? []) as any[];
    return q
      ? list.filter(
          (p) =>
            String(p.name ?? "").toLowerCase().includes(q) ||
            String(p.supplier_name ?? "").toLowerCase().includes(q),
        )
      : list;
  }, [data?.products, manageSearch]);


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

  const setActive = useServerFn(setProductActive);
  const activeMut = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => setActive({ data: v }),
    onSuccess: (r: any) => {
      refresh();
      toast.success(r?.is_active ? "Product is now active" : "Product turned off");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const catMut = useMutation({
    mutationFn: () =>
      saveCat({
        data: { name: cat.name, emoji: cat.emoji, channel: cat.channel, image_url: cat.image_url || null },
      }),
    onSuccess: () => {
      setCat({ name: "", emoji: "📁", channel: "both", image_url: "" });
      refresh();
      toast.success("Category saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Save (or clear) the uploaded logo of an existing category. */
  const catLogoMut = useMutation({
    mutationFn: (c: any) =>
      saveCat({
        data: {
          id: c.id,
          name: c.name,
          emoji: c.emoji ?? "📁",
          sort_order: c.sort_order ?? 0,
          channel: c.channel ?? "both",
          image_url: logoUrl.trim() || null,
        },
      }),
    onSuccess: () => {
      setLogoFor("");
      setLogoUrl("");
      refresh();
      toast.success("Category logo saved");
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
          ...(form.id && form.supplier_id
            ? { price_override: form.price_override === "" ? null : Number(form.price_override) }
            : {}),
        },
      }),
    onSuccess: () => {
      const wasEdit = Boolean(form.id);
      setForm({ ...EMPTY });
      refresh();
      toast.success("Product saved");
      setView(wasEdit ? "products" : "hub");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function editProduct(p: any) {
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
      price_override: (p as any).price_override ?? "",
      supplier_id: p.supplier_id ?? "",
      delivery_type: p.delivery_type,
      image_url: p.image_url ?? "",
      delivery_time: p.delivery_time ?? "",
      badge: p.badge ?? "",
      manual_note: p.manual_note ?? "",
      category_id: p.category_id ?? "",
      is_active: p.is_active,
      sort_order: p.sort_order,
    });
    setStockFor("");
    setView("form");
  }

  const hubCards = [
    {
      id: "categories" as View,
      title: "Categories",
      desc: "Create, edit, delete and assign products to categories.",
      icon: FolderTree,
      meta: `${(data?.categories ?? []).length} categor(ies)`,
    },
    {
      id: "products" as View,
      title: "Products",
      desc: "Full catalogue with search, supplier filter, stock and actions.",
      icon: Boxes,
      meta: `${(data?.products ?? []).length} product(s)`,
    },
    {
      id: "form" as View,
      title: "Add Product",
      desc: "Create a new product with pricing, images and delivery details.",
      icon: PlusCircle,
      meta: "New entry",
    },
    {
      id: "pricing" as View,
      title: "Pricing / Stock settings",
      desc: "Product icons (Premium emoji) and bulk icon apply options.",
      icon: Sparkles,
      meta: "Icons & defaults",
    },
  ];

  const backBtn = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        setStockFor("");
        setView("hub");
      }}
    >
      <ArrowLeft className="mr-1 h-4 w-4" /> Back
    </Button>
  );

  const categoriesSection = (
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
        <div className="space-y-1">
          <Label>Category logo (optional)</Label>
          <ImageUploadField
            value={cat.image_url}
            onChange={(url) => setCat({ ...cat, image_url: url })}
            placeholder="Logo image URL"
          />
          <p className="text-xs text-muted-foreground">
            Recommended: square <strong>512×512 px (1:1)</strong> PNG with transparent background (min 128×128 px).
            JPG / WEBP also work. Max file size <strong>3MB</strong> (ideal 50–200KB). No logo = default icon.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          The order below is the exact serial shown in the Telegram bot and on the website. Use the arrows to move a
          category up or down.
        </p>
        <ul className="space-y-1 text-sm">
          {(data?.categories ?? []).map((c: any, idx: number) => (
            <li key={c.id} className="rounded-md bg-muted px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={idx === 0 || reorderMut.isPending}
                      onClick={() => moveCategory(idx, -1)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={idx === (data?.categories ?? []).length - 1 || reorderMut.isPending}
                      onClick={() => moveCategory(idx, 1)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className="w-5 shrink-0 text-xs font-semibold text-muted-foreground">{idx + 1}</span>
                  {c.image_url ? (
                    <img src={c.image_url} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
                  ) : (
                    <span>{c.emoji}</span>
                  )}
                  <span className="truncate">{c.name}</span>
                  <Badge variant="secondary">{c.channel ?? "both"}</Badge>
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const open = logoFor === c.id;
                      setLogoFor(open ? "" : c.id);
                      setLogoUrl(open ? "" : (c.image_url ?? ""));
                    }}
                  >
                    {logoFor === c.id ? "Close" : "Logo"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openManager(c.id)}>
                    {manageCat === c.id ? "Close" : "Manage products"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => delCat({ data: { id: c.id } }).then(refresh)}>
                    Delete
                  </Button>
                </div>
              </div>
              {logoFor === c.id && (
                <div className="mt-3 space-y-2">
                  <ImageUploadField value={logoUrl} onChange={setLogoUrl} placeholder="Logo image URL" />
                  <p className="text-xs text-muted-foreground">
                    Best size: <strong>512×512 px (1:1)</strong>, PNG with transparent background. Max <strong>3MB</strong>.
                    Clear the field and save to go back to the default icon.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => catLogoMut.mutate(c)} disabled={catLogoMut.isPending}>
                      Save logo
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLogoUrl("")}>
                      Remove logo
                    </Button>
                  </div>
                </div>
              )}
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
  );

  const formSection = (
    <Card>
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
        {form.id && form.supplier_id ? (
          <div className="space-y-1">
            <Label>Custom price (supplier override)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="auto (percentage)"
              value={form.price_override}
              onChange={(e) => setForm({ ...form, price_override: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the percentage markup. A custom price stays fixed on supplier sync.
            </p>
          </div>
        ) : null}
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
            <Button
              variant="outline"
              onClick={() => {
                setForm({ ...EMPTY });
                setView("products");
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const pricingSection = (
    <Card>
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
  );

  const catalogueSection = (
    <>
      <Card>
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
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p: any) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" onError={brandFallbackOnError} className="h-8 w-8 rounded object-cover" />
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
                  <td>
                    <span className="flex items-center gap-2">
                      <Switch
                        checked={p.is_active !== false}
                        disabled={activeMut.isPending}
                        onCheckedChange={(v) => activeMut.mutate({ id: p.id, is_active: v })}
                        aria-label={`Toggle ${p.name}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {p.is_active !== false ? "On" : "Off"}
                      </span>
                    </span>
                  </td>
                  <td className="space-x-1 text-right">
                    <Button size="sm" variant="ghost" onClick={() => editProduct(p)}>
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
    </>
  );

  return (
    <AdminShell title="Products & Stock">
      {view === "hub" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {hubCards.map((c) => {
            const Icon = c.icon;
            return (
              <Button
                key={c.id}
                type="button"
                variant="ghost"
                onClick={() => {
                  if (c.id === "form") setForm({ ...EMPTY });
                  setView(c.id);
                }}
                className="group h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-2xl border border-border/70 bg-card p-4 text-left transition hover:border-primary/50 hover:bg-card hover:shadow-lg"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold leading-tight">{c.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{c.desc}</span>
                  <span className="mt-2 block text-[0.7rem] font-medium text-primary">{c.meta}</span>
                </span>
              </Button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {backBtn}
            <span className="text-sm font-semibold">
              {view === "categories"
                ? "Categories"
                : view === "products"
                  ? "Products"
                  : view === "pricing"
                    ? "Pricing / Stock settings"
                    : form.id
                      ? "Edit product"
                      : "Add product"}
            </span>
            {view === "products" && (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setForm({ ...EMPTY });
                  setView("form");
                }}
              >
                <PlusCircle className="mr-1 h-4 w-4" /> Add product
              </Button>
            )}
          </div>

          {view === "categories" && categoriesSection}
          {view === "products" && catalogueSection}
          {view === "form" && formSection}
          {view === "pricing" && pricingSection}
        </div>
      )}
    </AdminShell>
  );
}
