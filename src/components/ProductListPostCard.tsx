import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { ListOrdered, Send } from "lucide-react";
import { generateProductList, saveProductListEmojis, sendProductListPost, getProductListOptions, saveProductListCopy } from "@/lib/product-list.functions";
import { PRODUCT_LIST_EMOJI_KEYS, formatUsd, parseEmoji, defaultProductListCopy, type ProductListMode, type ProductListCopy } from "@/lib/product-list";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { colorIndexesFor, supplierBadgeStyle } from "@/lib/supplier-colors";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Gen = Awaited<ReturnType<typeof generateProductList>>;

export function ProductListPostCard({ mode = "all" }: { mode?: ProductListMode }) {
  const optionsFn = useServerFn(getProductListOptions);
  const copySave = useServerFn(saveProductListCopy);
  const { data: options, error: optionsError } = useQuery({ queryKey: ["product-list-options"], queryFn: () => optionsFn() });
  const [categoryId, setCategoryId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [supplier, setSupplier] = useState("all");
  const [search, setSearch] = useState("");
  const [copy, setCopy] = useState<ProductListCopy>(defaultProductListCopy(mode,"QORIX"));
  const [requestId, setRequestId] = useState("");
  useEffect(() => { if (options) { setEmojis(options.emojis); if (options.savedCopy?.[mode]) setCopy({ ...defaultProductListCopy(mode,"QORIX"), ...options.savedCopy[mode] }); } }, [options,mode]);
  const colors = colorIndexesFor((options?.suppliers ?? []).map((s: any) => s.name));
  const visible = (options?.products ?? []).filter((p: any) => (supplier === "all" || (supplier === "inhouse" ? !p.supplier_id : p.supplier_id === supplier)) && p.name.toLowerCase().includes(search.toLowerCase()));
  const gen = useServerFn(generateProductList);
  const save = useServerFn(saveProductListEmojis);
  const send = useServerFn(sendProductListPost);
  const [list, setList] = useState<Gen | null>(null);
  const [emojis, setEmojis] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "gen" | "save" | "send">("");

  const run = async (offset = list?.nextOffset ?? 0) => {
    setBusy("gen");
    try {
      const r = await gen({ data: { offset, mode, categoryId: categoryId || undefined, ids: selected, copy } });
      setRequestId(crypto.randomUUID());
      setList(r);
      setEmojis(r.emojis as Record<string, string>);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  const glyph = (k: string, fb: string) => parseEmoji(emojis[k], fb).glyph;

  return (
    <section className="mb-4 border-y border-primary/30">
      <div className="space-y-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ListOrdered className="size-4 text-primary" /> {mode === "category" ? "Category Products" : mode === "selected" ? "Top Selling Products" : "Product list post"}
          </p>
          <Button onClick={() => run()} disabled={busy !== "" || !options || (mode === "category" && !categoryId) || (mode === "selected" && !selected.length)}>
            {busy === "gen" ? "Generating..." : list && list.nextOffset > 0 ? "Generate Next 40" : "Generate Product List"}
          </Button>
        </div>

        {optionsError && <p className="text-sm text-destructive">{optionsError.message}</p>}
        {mode === "category" && <Select value={categoryId} onValueChange={id => { setCategoryId(id); setList(null); const category = options?.categories.find((c: any) => c.id === id); setCopy(c => ({ ...c, ...defaultProductListCopy("category",category?.name ?? "Category"), channel: c.channel, updates: c.updates, chat: c.chat })); }}><SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{(options?.categories ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>}
        {mode === "selected" && <div className="space-y-3">
          <div className="flex flex-wrap gap-2"><Button size="sm" variant={supplier === "all" ? "default" : "outline"} onClick={() => setSupplier("all")}>All</Button><Button size="sm" variant={supplier === "inhouse" ? "default" : "outline"} onClick={() => setSupplier("inhouse")}>In-house</Button>{(options?.suppliers ?? []).map((s: any) => <Button key={s.id} size="sm" variant="outline" style={supplierBadgeStyle(colors.get(s.name) ?? 0)} aria-pressed={supplier === s.id} onClick={() => setSupplier(s.id)}>{s.name}{supplier === s.id ? " ✓" : ""}</Button>)}</div>
          <Input aria-label="Search products" placeholder="Search products" value={search} onChange={e => setSearch(e.target.value)} />
          <p className="text-sm font-semibold">Selected: {selected.length}</p>
          <div className="max-h-72 overflow-y-auto divide-y divide-border border border-border">{visible.map((p: any) => <label key={p.id} className="flex items-center gap-3 p-3"><Checkbox checked={selected.includes(p.id)} onCheckedChange={checked => { setSelected(ids => checked ? [...ids,p.id] : ids.filter(id => id !== p.id)); setList(null); }} /><span className="min-w-0 flex-1 break-words text-sm">{p.name}</span><span className="shrink-0 text-sm">{formatUsd(p.price)}</span></label>)}</div>
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">{(["title","intro","instant","warranty","bulk","channel","updates","chat"] as const).map(key => <div key={key} className="space-y-1"><Label htmlFor={`plist-${key}`}>{({title:"Heading",intro:"Introduction",instant:"Delivery text",warranty:"Warranty text",bulk:"Bulk text",channel:"Official channel link",updates:"Update group link",chat:"General chat link"})[key]}</Label>{key === "intro" ? <Textarea id={`plist-${key}`} value={copy[key]} onChange={e => { setCopy(c => ({...c,[key]:e.target.value})); setList(null); }} /> : <Input id={`plist-${key}`} value={copy[key]} onChange={e => { setCopy(c => ({...c,[key]:e.target.value})); setList(null); }} />}</div>)}</div>
        <Button variant="outline" size="sm" onClick={async () => { try { await copySave({ data: {mode,copy} }); toast.success("Text and links saved"); } catch(e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Save text & links</Button>
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <Label>Product List Emoji</Label>
          <p className="text-xs text-muted-foreground">
            Plain emoji (🔥), a Premium emoji ID, or ID|🔥. Product rows use each product's own emoji.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRODUCT_LIST_EMOJI_KEYS.map((k) => (
              <div key={k.key} className="space-y-1">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <Input
                  value={emojis[k.key] ?? ""}
                  placeholder={k.fallback}
                  onChange={(e) => setEmojis((m) => ({ ...m, [k.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== ""}
            onClick={async () => {
              setBusy("save");
              try {
                await save({ data: { emojis } });
                toast.success("Emoji saved");
                if (list) await run(list.offset);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              } finally {
                setBusy("");
              }
            }}
          >
            Save emoji
          </Button>
        </div>

        {list && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="font-semibold">
                {glyph("title", "🛍")} {list.copy.title}
              </p>
              <p className="text-sm">{list.copy.intro}</p>
              <p className="mb-2 text-xs italic text-muted-foreground">{list.products.length ? list.offset + 1 : 0}–{list.offset + list.products.length} of {list.totalProducts} products</p>
              <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">PRODUCT</th>
                      <th className="p-2 text-left">PRICE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.products.map((p, i) => (
                      <tr key={i} className="border-t border-border odd:bg-background">
                        <td className="p-2">{parseEmoji(p.emoji, "📦").glyph} {p.name}</td>
                        <td className="whitespace-nowrap p-2">{glyph("price", "💲")} {formatUsd(p.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                <li>{glyph("instant", "✅")} {list.copy.instant}</li>
                <li>{glyph("warranty", "🛡")} {list.copy.warranty}</li>
                <li>{glyph("bulk", "🔥")} {list.copy.bulk}</li>
                {list.botUsername && <li>{glyph("order", "🛒")} <b>Order here →</b> @{list.botUsername}</li>}
              </ul>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">{[["Official Channel",list.copy.channel],["Update Group",list.copy.updates],["General Chat",list.copy.chat]].filter(([,url]) => url).map(([label,url]) => <a key={label} href={url} target="_blank" rel="noreferrer" className="text-primary underline">{label}</a>)}</div>
              <p className="mt-2 text-[11px] text-muted-foreground">Preview — Premium emoji appear in Telegram.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Goes to all bot users + {list.groups} group(s)</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={busy !== ""}>
                    <Send className="mr-2 size-4" />
                    {busy === "send" ? "Queuing..." : "Send"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send product list?</AlertDialogTitle>
                    <AlertDialogDescription>
                      These {list.products.length} products ({list.offset + 1}–{list.offset + list.products.length}) go to every bot user and {list.groups} group(s). This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        setBusy("send");
                        try {
                          const r = await send({ data: { products: list.products, storeName: list.storeName, botUsername: list.botUsername, emojis: list.emojis, copy: list.copy, requestId } });
                          toast.success(`Queued for ${r.total} recipients`);
                          setList(null);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed");
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      Add to queue
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
