import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeDollarSign, Boxes, ChevronDown, Clock, NotebookPen, Quote as QuoteIcon, ShieldCheck, Sparkles, Tag, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { getStoreProduct } from "@/lib/shop.functions";
import { stripEmoji } from "@/lib/mobile-template";
import { ProductPremiumIcon } from "@/components/mobile/ProductPremiumIcon";
import { ButtonPremiumIcon } from "@/components/mobile/ButtonPremiumIcon";
import { CategoryPremiumIcon } from "@/components/mobile/CategoryPremiumIcon";
import type { CategoryPremiumMedia } from "@/lib/category-premium-media";

type Product = {
  id: string; name: string; price: number | string; old_price?: number | string | null;
  stock?: number | null; sold?: number | null; description?: string | null;
  important_note?: string | null; manual_note?: string | null; quick_guide?: string | null;
  details?: unknown; delivery_time?: string | null; delivery_type?: string | null;
  manual_stock_limited?: boolean | null;
};

// Only public captured media pointers are imported; Telegram markup is never executed as HTML.
const pointers = import.meta.glob<{ default: { url: string } }>("/src/assets/**/*.asset.json", { eager: true });
const captured = new Map<string, CategoryPremiumMedia>();
for (const [path, pointer] of Object.entries(pointers)) {
  const match = path.match(/\/(\d+)\.(json|webm|webp)\.asset\.json$/);
  const id = match?.[1];
  if (id) captured.set(id, { url: pointer.default.url, kind: match?.[2] === "json" ? "lottie" : match?.[2] === "webm" ? "video" : "image" });
}

function ProductText({ text }: { text: string }) {
  const pieces: ReactNode[] = [];
  const tokens = /\{\s*ce\s*:\s*(\d{5,25})\s*(?::\s*([^}]*?))?\s*\}|\[\s*(\d{15,25})\s*\]/gi;
  let start = 0;
  for (const token of text.matchAll(tokens)) {
    const index = token.index ?? 0;
    pieces.push(stripEmoji(text.slice(start, index)));
    const id = token[1] || token[3];
    const media = id ? captured.get(id) : undefined;
    pieces.push(<span key={index} className="inline-flex h-5 w-5 align-middle [&_span]:h-5 [&_span]:w-5 [&_img]:h-5 [&_img]:w-5 [&_video]:h-5 [&_video]:w-5">{media ? <CategoryPremiumIcon media={media} /> : <Sparkles className="h-4 w-4" />}</span>);
    start = index + token[0].length;
  }
  pieces.push(stripEmoji(text.slice(start)));
  return <span className="whitespace-pre-line break-words">{pieces}</span>;
}

function ProductQuote({ children, expandable = false }: { children: ReactNode; expandable?: boolean }) {
  const content = <div className="relative rounded border-l-[3px] border-tg-quote-bar bg-tg-quote py-1 pl-2 pr-7 text-base leading-snug"><QuoteIcon aria-hidden className="absolute right-2 top-1.5 h-3.5 w-3.5 fill-tg-quote-bar text-tg-quote-bar" />{children}</div>;
  if (!expandable) return content;
  return <details className="group">
    <summary aria-label="Expand description" className="relative cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <div className="[&>div]:max-h-[4.5rem] [&>div]:overflow-hidden group-open:hidden">{content}</div>
      <span className="hidden group-open:block text-sm text-tg-quote-bar">Collapse description</span>
      <ChevronDown aria-hidden className="absolute bottom-1 right-1 h-4 w-4 text-tg-quote-bar group-open:rotate-180" />
    </summary>
    <div className="mt-1">{content}</div>
  </details>;
}

const money = (v: unknown) => `$${Number(v ?? 0).toFixed(2)}`;

/** Bot-order section order, using the existing safe full-product reader rather than catalogue excerpts. */
export function BotProductMessage({ product }: { product: Product }) {
  const fetchProduct = useServerFn(getStoreProduct);
  const { data, isPending, isError } = useQuery({
    queryKey: ["store-product", product.id], queryFn: () => fetchProduct({ data: { id: product.id } }),
    refetchInterval: 10_000,
  });
  const p: Product = data ? { ...product, ...data, price: data.price ?? product.price } : product;
  const important = p.important_note ?? p.manual_note ?? "";
  const rows = Array.isArray(p.details) ? p.details.map((r) => ({ label: String(r?.label ?? "").trim(), value: String(r?.value ?? "").trim() })).filter((r) => r.label && r.value).slice(0, 12) : [];
  const off = Number(p.old_price) > Number(p.price) ? Math.round((1 - Number(p.price) / Number(p.old_price)) * 100) : 0;
  const manual = p.delivery_type === "manual";
  return <article aria-label="Product details" className="w-full rounded-t-2xl rounded-b-md bg-tg-bubble px-3.5 py-3 text-base font-normal leading-snug shadow-sm [&_section]:font-normal">
    <p className="flex items-start gap-1.5 font-semibold"><ProductPremiumIcon productId={p.id} /><span className="min-w-0 break-words pt-1">{stripEmoji(p.name)}</span></p>
    {off > 0 && <p className="mt-4 flex items-center gap-1.5 font-semibold"><ButtonPremiumIcon setting="ui_icon_prod_flash" fallback={Zap} />FLASH SALE -{off}%</p>}
    <p className="mt-4 flex items-center gap-1.5"><ButtonPremiumIcon setting="ui_icon_prod_price" fallback={BadgeDollarSign} /><span>Price: {off > 0 && <><s className="text-tg-muted">{money(p.old_price)}</s> → </>}<b>{money(p.price)}</b></span></p>
    {Number(p.sold) > 0 && <p className="mt-4 flex items-center gap-1.5"><ButtonPremiumIcon setting="ui_icon_prod_sold" fallback={Tag} /><span><b>{p.sold}</b> sold</span></p>}
    {p.description?.trim() && <section className="mt-5"><p className="mb-1 font-semibold">Must Read The description First</p><ProductQuote expandable><ProductText text={p.description} /></ProductQuote></section>}
    {important.trim() && <section className="mt-5"><p className="mb-1 font-semibold">Important</p><ProductQuote><ButtonPremiumIcon setting="ui_icon_prod_important_line" fallback={NotebookPen} /> <ProductText text={important} /></ProductQuote></section>}
    {p.quick_guide?.trim() && <div className="mt-5"><ProductQuote expandable><p className="flex items-center gap-1.5 font-semibold"><ButtonPremiumIcon setting="ui_icon_prod_guide" fallback={Sparkles} />Quick Guide</p><ProductText text={p.quick_guide} /></ProductQuote></div>}
    {rows.length > 0 && <div className="mt-5"><ProductQuote>{rows.map((row, i) => <p key={i}>• <b>{row.label}:</b> {row.value}</p>)}</ProductQuote></div>}
    {p.delivery_time?.trim() && <p className="mt-5 flex items-center gap-1.5"><ButtonPremiumIcon setting="ui_icon_prod_delivery" fallback={ShieldCheck} /><span>Warranty: <b>{p.delivery_time}</b></span></p>}
    <div className="mt-5">
      {(!manual || p.manual_stock_limited) && <p className="flex items-center gap-1.5"><ButtonPremiumIcon setting="ui_icon_prod_stock" fallback={Boxes} /><span>In Stock: <b>{Number(p.stock ?? 0)} available</b></span></p>}
      <p className="flex items-start gap-1.5 italic"><ButtonPremiumIcon setting={manual ? "ui_icon_prod_manual_note" : "ui_icon_prod_auto_note"} fallback={manual ? Clock : Zap} /><span>{manual ? "Delivery is done by an admin after payment confirmation." : "Delivery is automatic after payment confirmation."}</span></p>
    </div>
    {isPending && <p role="status" className="mt-2 text-xs text-tg-muted">Loading full details…</p>}
    {isError && <p role="status" className="mt-2 text-xs text-tg-muted">Full details could not be loaded. Please refresh.</p>}
  </article>;
}