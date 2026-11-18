import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, Bell, BookOpen, Boxes, ChevronLeft, ChevronRight, CircleCheck, CircleX, Code2,
  Gift, Home, LayoutGrid, LifeBuoy, Mail, Megaphone, Minus, Package, Plus, RefreshCw, Send,
  ShoppingBag, ShoppingCart, Sparkles, Store, Trash2, User, Users, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import { mobileImageFor, stripEmoji } from "@/lib/mobile-template";
import { BotFrame, BotLogo, bottomCls } from "@/components/mobile/BotFrame";

type Cat = { id: string; name: string; image_url?: string | null };
type Prod = {
  id: string; name: string; price: number | string; old_price?: number | string | null; stock?: number | null;
  in_stock?: boolean; category_ids?: string[]; description?: string | null; image_url?: string | null;
  slug?: string | null; delivery_time?: string | null; instant?: boolean | null;
};
type View =
  | { k: "start" } | { k: "menu" } | { k: "cats" }
  | { k: "prods"; cat: string | null; page: number }
  | { k: "prod"; id: string; from: View } | { k: "qty"; id: string; from: View };

const PAGE = 30;
const money = (v: unknown) => `$${Number(v ?? 0).toFixed(2)}`;

export function BotStorefront(props: {
  name: string; logo: string; users: number | null; categories: Cat[]; products: Prod[];
  images: Record<string, string>; catImages: Record<string, string>; loading: boolean;
}) {
  const { categories, products, images } = props;
  const [view, setView] = useState<View>({ k: "start" });
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [view]);

  const inStockCount = products.filter((p) => p.in_stock !== false).length;
  const imgOf = (p: Prod) => mobileImageFor(images, p.id, p.image_url);
  const catProducts = (cat: string | null) =>
    cat ? products.filter((p) => (p.category_ids ?? []).includes(cat)) : products.filter((p) => p.in_stock !== false);
  const productById = (id: string) => products.find((p) => p.id === id);

  let body: ReactNode;
  if (view.k === "start") {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <Bubble className="max-w-xs text-center">
          <BotLogo src={props.logo} size="lg" />
          <p className="mt-3 text-base font-bold">{props.name}</p>
          <p className="mt-1 text-sm text-tg-muted">
            Premium AI, developer, streaming and creative apps with automatic delivery after payment.
          </p>
        </Bubble>
      </div>
    );
  } else if (view.k === "menu") {
    body = (
      <>
        <Bubble>
          <p className="flex items-center gap-2 text-base font-bold"><Sparkles className="h-5 w-5 text-tg-quote-bar" /> Welcome to {props.name}</p>
          <p className="mt-1 text-sm">100% authentic premium apps — delivered automatically.</p>
          <Quote>
            <MenuLine icon={Store} t="Shop" d="Browse all categories" />
            <MenuLine icon={Package} t="Orders" d="View order status & delivery" />
            <MenuLine icon={Wallet} t="Wallet" d="Check balance & add funds" />
            <MenuLine icon={Gift} t="Referral Store" d="Invite friends & view rewards" />
            <MenuLine icon={LifeBuoy} t="Support" d="Contact support for help" />
            <MenuLine icon={Code2} t="Reseller API" d="Access the reseller API & guide" />
          </Quote>
          <p className="mt-3 flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-tg-link" /> Join Community</p>
          <p className="text-sm">Join for stock alerts and updates.</p>
          <a className="mt-1 flex items-center gap-2 text-sm text-tg-link" href="https://t.me/QORIXCHAT" target="_blank" rel="noreferrer"><Users className="h-4 w-4" /> Community Group</a>
          <a className="flex items-center gap-2 text-sm text-tg-link" href="https://t.me/qorixlab" target="_blank" rel="noreferrer"><Megaphone className="h-4 w-4" /> Official Channel</a>
          <p className="mt-3 text-sm">Choose an option below to get started.</p>
        </Bubble>
        <Bubble>
          <p className="flex items-center gap-2 font-bold"><ShoppingBag className="h-4 w-4 text-tg-quote-bar" /> QORIX STORE MENU</p>
          <p className="text-sm">Shop · Wallet · Orders · Support</p>
        </Bubble>
        <Keys cols={3}>
          <Key icon={Store} onClick={() => setView({ k: "cats" })}>SHOP</Key>
          <Key icon={ShoppingCart} onClick={() => setView({ k: "prods", cat: null, page: 0 })}>Cart</Key>
          <KeyLink icon={Package} to="/account/orders">Orders</KeyLink>
          <KeyLink icon={Wallet} to="/account">Wallet</KeyLink>
          <KeyLink icon={Gift} to="/account/referrals">Freebies</KeyLink>
          <KeyLink icon={User} to="/account/profile">Profile</KeyLink>
        </Keys>
        <Keys cols={1}><KeyLink tone="green" icon={Gift} to="/account/referrals">Referral Store</KeyLink></Keys>
        <Keys cols={2}>
          <KeyLink tone="green" icon={LifeBuoy} to="/contact">Support</KeyLink>
          <KeyLink tone="green" icon={Mail} to="/track">Emails & Trials</KeyLink>
          <KeyLink tone="green" icon={Code2} to="/reseller/docs">Reseller API</KeyLink>
          <Key tone="green" icon={Trash2} onClick={() => setView({ k: "start" })}>Clear Chat</Key>
        </Keys>
      </>
    );
  } else if (view.k === "cats") {
    body = (
      <>
        <Bubble>
          <Title>CATEGORIES</Title>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium"><CircleCheck className="h-4 w-4 text-tg-btn-green" /> {inStockCount} in stock</p>
          <p className="text-sm italic">Every product is neatly organised by category — just tap a category below to browse and buy instantly.</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold"><ShoppingBag className="h-4 w-4 text-tg-quote-bar" /> Happy shopping with QORIX!</p>
        </Bubble>
        <Keys cols={1}><Key tone="green" icon={Zap} onClick={() => setView({ k: "prods", cat: null, page: 0 })}>All products ({inStockCount})</Key></Keys>
        <Keys cols={categories.length > 8 ? 3 : 2}>
          {categories.map((c) => (
            <Key key={c.id} img={mobileImageFor(props.catImages, c.id, c.image_url) || undefined} icon={LayoutGrid} onClick={() => setView({ k: "prods", cat: c.id, page: 0 })}>{stripEmoji(c.name)}</Key>
          ))}
        </Keys>
        {props.loading && <p className="text-center text-xs text-tg-bubble-fg">Loading…</p>}
        <Keys cols={2}>
          <Key tone="green" icon={RefreshCw} onClick={() => setView({ k: "cats" })}>Refresh Stock</Key>
          <Key tone="red" icon={ChevronLeft} onClick={() => setView({ k: "menu" })}>Main Menu</Key>
        </Keys>
      </>
    );
  } else if (view.k === "prods") {
    const list = catProducts(view.cat);
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const slice = list.slice(view.page * PAGE, view.page * PAGE + PAGE);
    const cat = categories.find((c) => c.id === view.cat);
    body = (
      <>
        <Bubble>
          <Title>PRODUCTS</Title>
          <Quote>{cat ? `${cat.name}'s all products` : "All products"}</Quote>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium"><CircleCheck className="h-4 w-4 text-tg-btn-green" /> {list.filter((p) => p.in_stock !== false).length} in stock</p>
          <p className="text-sm italic">Tap a product below to view details.</p>
        </Bubble>
        <Keys cols={1}>
          {slice.map((p) => (
            <Key key={p.id} tone={p.in_stock === false ? "red" : "blue"} img={imgOf(p)} icon={Package}
              onClick={() => setView({ k: "prod", id: p.id, from: view })}>
              {stripEmoji(p.name)} | {money(p.price)} | <Boxes className="inline h-4 w-4" /> {Number(p.stock ?? 0)}
            </Key>
          ))}
          {slice.length === 0 && <p className="text-center text-sm text-tg-bubble-fg">No products here yet.</p>}
        </Keys>
        {pages > 1 && (
          <Keys cols={2}>
            <Key icon={ChevronLeft} disabled={view.page === 0} onClick={() => setView({ ...view, page: view.page - 1 })}>Prev</Key>
            <Key icon={ChevronRight} disabled={view.page >= pages - 1} onClick={() => setView({ ...view, page: view.page + 1 })}>Next ({view.page + 1}/{pages})</Key>
          </Keys>
        )}
        <Keys cols={1}>
          <Key tone="green" icon={RefreshCw} onClick={() => setView({ ...view })}>Refresh Stock</Key>
          <Key tone="green" icon={LayoutGrid} onClick={() => setView({ k: "cats" })}>Back to Categories</Key>
        </Keys>
        <Keys cols={2}>
          <Key tone="green" icon={ShoppingCart} onClick={() => setView({ k: "prods", cat: null, page: 0 })}>Cart</Key>
          <Key tone="red" icon={ChevronLeft} onClick={() => setView({ k: "menu" })}>Main Menu</Key>
        </Keys>
      </>
    );
  } else {
    const p = productById(view.id);
    const back = view.k === "qty" ? { k: "prod" as const, id: view.id, from: view.from } : view.from;
    if (!p) body = <Bubble>This product is no longer available.</Bubble>;
    else if (view.k === "prod") {
      const off = p.old_price && Number(p.old_price) > Number(p.price)
        ? Math.round((1 - Number(p.price) / Number(p.old_price)) * 100) : 0;
      const sold = p.in_stock === false;
      body = (
        <>
          <Bubble>
            {imgOf(p) && <img src={imgOf(p)} alt={p.name} loading="lazy" className="mb-3 aspect-video w-full rounded-lg object-cover" />}
            <p className="text-base font-bold uppercase">{stripEmoji(p.name)}</p>
            {off > 0 && <p className="mt-2 flex items-center gap-2 font-semibold"><Zap className="h-4 w-4 text-tg-btn-red" /> FLASH SALE -{off}%</p>}
            <p className="text-sm">Price: {off > 0 && <s className="text-tg-muted">{money(p.old_price)}</s>} {off > 0 && "→ "}<b>{money(p.price)}</b></p>
            {p.description && (<><p className="mt-3 font-semibold">Must Read The description First</p><Quote><span className="whitespace-pre-line">{stripEmoji(p.description)}</span></Quote></>)}
            <p className="mt-3 flex items-center gap-2 text-sm"><Boxes className="h-4 w-4 text-tg-link" /> In Stock: <b>{Number(p.stock ?? 0)} available</b></p>
            <p className="flex items-center gap-2 text-sm italic"><Zap className="h-4 w-4 text-tg-btn-red" /> Delivery is automatic after payment confirmation.</p>
          </Bubble>
          {sold ? (
            <Keys cols={1}>
              <Key tone="green" icon={CircleX}>Out of stock</Key>
              <KeyLink tone="green" icon={Bell} to="/store/$id" params={{ id: p.slug ?? p.id }}>Notify Me When Available</KeyLink>
            </Keys>
          ) : (
            <Keys cols={2}>
              <Key tone="green" icon={ShoppingCart} onClick={() => setView({ k: "qty", id: p.id, from: view.from })}>Buy Now</Key>
              <KeyLink tone="green" icon={BookOpen} to="/store/$id" params={{ id: p.slug ?? p.id }}>Full Details</KeyLink>
            </Keys>
          )}
          <Keys cols={2}>
            <Key tone="green" icon={RefreshCw} onClick={() => setView({ ...view })}>Refresh</Key>
            <Key tone="red" icon={ArrowLeft} onClick={() => setView(back)}>Back</Key>
            <Key tone="green" icon={ShoppingCart} onClick={() => setView({ k: "prods", cat: null, page: 0 })}>Cart</Key>
            <Key tone="green" icon={Home} onClick={() => setView({ k: "menu" })}>Home</Key>
          </Keys>
        </>
      );
    } else body = <QtyPicker p={p} onBack={() => setView(back)} />;
  }

  return (
    <BotFrame scrollRef={scroller}
      onBack={() => setView(view.k === "start" ? { k: "start" } : view.k === "menu" ? { k: "start" } : { k: "menu" })}
      onMenu={() => setView({ k: "menu" })}
      footer={view.k === "start" ? (
        <button type="button" onClick={() => setView({ k: "menu" })}
          className="w-full rounded-2xl bg-tg-header py-3.5 text-base font-bold uppercase tracking-wide text-tg-link shadow-sm backdrop-blur">
          Start
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setView({ k: "cats" })} className={bottomCls}><LayoutGrid className="h-4 w-4 shrink-0" /><span className="truncate">Products</span></button>
          <Link to="/account" className={bottomCls}><Wallet className="h-4 w-4 shrink-0" /><span className="truncate">Deposit</span></Link>
          <Link to="/account/orders" className={bottomCls}><Package className="h-4 w-4 shrink-0" /><span className="truncate">My Orders</span></Link>
        </div>
      )}>
      {body}
    </BotFrame>
  );
}

function QtyPicker({ p, onBack }: { p: Prod; onBack: () => void }) {
  const [qty, setQty] = useState(1);
  const max = Math.max(1, Math.min(20, Number(p.stock ?? 20) || 20));
  const total = useMemo(() => Number(p.price) * qty, [p.price, qty]);
  return (
    <>
      <Bubble>
        <p className="flex items-center gap-2 font-bold"><ShoppingCart className="h-4 w-4 text-tg-link" /> Select quantity</p>
        <hr className="my-2 w-40 border-tg-bubble-fg/40" />
        <p className="uppercase">{stripEmoji(p.name)}</p>
        <p>Price: <b>{money(p.price)}</b></p>
        <p className="mt-2 text-sm italic">Choose how many you want — payment options come next.</p>
      </Bubble>
      <Keys cols={3}>
        {[1, 2, 3].map((n) => <Key key={n} active={qty === n} disabled={n > max} onClick={() => setQty(n)}>{n}×</Key>)}
      </Keys>
      <Keys cols={2}>
        {[5, 10].map((n) => <Key key={n} active={qty === n} disabled={n > max} onClick={() => setQty(n)}>{n}×</Key>)}
      </Keys>
      <Keys cols={3}>
        <Key icon={Minus} disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>Less</Key>
        <Key>{qty} × {money(p.price)}</Key>
        <Key icon={Plus} disabled={qty >= max} onClick={() => setQty((q) => Math.min(max, q + 1))}>More</Key>
      </Keys>
      <Keys cols={1}>
        <KeyLink tone="green" icon={Send} to="/checkout" search={{ id: p.id, qty, step: "details" }}>Checkout · {money(total)}</KeyLink>
        <Key tone="red" icon={ArrowLeft} onClick={onBack}>Back</Key>
      </Keys>
    </>
  );
}

/* ---------- small Telegram-like building blocks ---------- */

export function Bubble({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`max-w-[92%] self-start rounded-2xl rounded-bl-md bg-tg-bubble px-3.5 py-2.5 shadow-sm ${className}`}>{children}</div>;
}
export function Title({ children }: { children: ReactNode }) {
  return <p className="bg-gradient-to-r from-tg-btn-red to-tg-quote-bar bg-clip-text text-2xl font-black tracking-[0.15em] text-transparent">{children}</p>;
}
export function Quote({ children }: { children: ReactNode }) {
  return <div className="mt-2 rounded-md border-l-4 border-tg-quote-bar bg-tg-quote px-3 py-2 text-sm">{children}</div>;
}
function MenuLine({ icon: I, t, d }: { icon: LucideIcon; t: string; d: string }) {
  return <p className="flex items-start gap-2 py-0.5"><I className="mt-0.5 h-4 w-4 shrink-0 text-tg-quote-bar" /><span><b>{t}</b> — {d}</span></p>;
}
export function Keys({ cols, children }: { cols: 1 | 2 | 3; children: ReactNode }) {
  const c = cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  return <div className={`grid ${c} gap-1.5`}>{children}</div>;
}
type Tone = "blue" | "green" | "red";
const toneCls: Record<Tone, string> = { blue: "bg-tg-btn", green: "bg-tg-btn-green", red: "bg-tg-btn-red" };
const keyCls = (tone: Tone, active?: boolean) =>
  `flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-tg-btn-fg shadow-sm transition active:scale-[0.98] disabled:opacity-50 ${toneCls[tone]} ${active ? "ring-2 ring-tg-btn-fg" : ""}`;
function KeyInner({ icon: I, img, children }: { icon?: LucideIcon | undefined; img?: string | undefined; children: ReactNode }) {
  return (
    <>
      {img ? <img src={img} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-md bg-tg-bubble object-cover" />
        : I ? <I className="h-4 w-4 shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </>
  );
}
export function Key({ tone = "blue", icon, img, children, onClick, disabled, active }: {
  tone?: Tone; icon?: LucideIcon | undefined; img?: string | undefined; children: ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean;
}) {
  return <button type="button" onClick={onClick} disabled={disabled} className={keyCls(tone, active)}><KeyInner icon={icon} img={img}>{children}</KeyInner></button>;
}
export function KeyLink({ tone = "blue", icon, children, ...link }: { tone?: Tone; icon?: LucideIcon; children: ReactNode } & Record<string, any>) {
  return <Link {...(link as any)} className={keyCls(tone)}><KeyInner icon={icon}>{children}</KeyInner></Link>;
}
