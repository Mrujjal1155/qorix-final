import { usdPrice } from "@/lib/price-format";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, Bell, BookOpen, Boxes, ChevronLeft, ChevronRight, CircleCheck, CircleX, Code2,
  Gift, Home, LayoutDashboard, LayoutGrid, LifeBuoy, LogIn, Mail, Minus, Package, Plus, RefreshCw, Send,
  ShoppingBag, ShoppingCart, Sparkles, Store, Trash2, User, UserPlus, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startTelegramLogin, claimTelegramLogin } from "@/lib/telegram-login.functions";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BotReferralView, BotSupportView } from "@/components/mobile/BotSupport";
import { getWebSupport } from "@/lib/web-wallet.functions";
import { mobileImageFor, stripEmoji } from "@/lib/mobile-template";
import { BotFrame, BotLogo, bottomBarCls, bottomCls } from "@/components/mobile/BotFrame";
import { CategoryPremiumIcon } from "@/components/mobile/CategoryPremiumIcon";
import { categoryPremiumMedia } from "@/lib/category-premium-media";
import { ProductPremiumIcon } from "@/components/mobile/ProductPremiumIcon";
import { ButtonPremiumIcon } from "@/components/mobile/ButtonPremiumIcon";
import { Button } from "@/components/ui/button";
import { BotStartProfile } from "@/components/mobile/BotStartProfile";
import { BotApiPanel } from "@/components/mobile/BotApiPanel";
import { BotProductMessage } from "@/components/mobile/BotProductMessage";

type Cat = { id: string; name: string; image_url?: string | null };
type Prod = {
  id: string; name: string; price: number | string; old_price?: number | string | null; stock?: number | null;
  in_stock?: boolean; category_ids?: string[]; description?: string | null; image_url?: string | null;
  slug?: string | null; delivery_time?: string | null; instant?: boolean | null;
};
type View =
  | { k: "start" } | { k: "choose" } | { k: "tg" } | { k: "guest"; what: string } | { k: "support" } | { k: "refer" } | { k: "api" } | { k: "free" } | { k: "menu" } | { k: "cats" }
  | { k: "prods"; cat: string | null; page: number }
  | { k: "prod"; id: string; from: View } | { k: "qty"; id: string; from: View };

const PAGE = 30;
const money = (v: unknown) => usdPrice(v);

export function BotStorefront(props: {
  name: string; logo: string; users: number | null; categories: Cat[]; products: Prod[];
  images: Record<string, string>; catImages: Record<string, string>; loading: boolean;
  initialProducts?: boolean; initialCategory?: string | null;
}) {
  const { categories, products, images } = props;
  const [view, setView] = useState<View>(() => props.initialProducts ? { k: "prods", cat: props.initialCategory ?? null, page: 0 } : { k: "start" });
  const scroller = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchSupport = useServerFn(getWebSupport);
  const { data: supportInfo } = useQuery({ queryKey: ["web-support"], queryFn: () => fetchSupport(), staleTime: 60_000 });
  const go = (v: "menu" | "support" | "tg" | "profile") =>
    v === "profile" ? (signedIn ? void navigate({ to: "/account/profile" }) : setView({ k: "menu" })) : setView({ k: v });
  // Signed in = connected Telegram account; otherwise the visitor shops as a guest (no ID).
  const [signedIn, setSignedIn] = useState(false);
  const [accountKey, setAccountKey] = useState<string | null>(null);
  useEffect(() => {
    // Once Guest or Telegram was chosen, open straight on the menu (no Start again), like the bot.
    // Products button on other pages lands here and opens the full product list, like the bot.
    const open = localStorage.getItem("qorix_open");
    if (open) {
      localStorage.removeItem("qorix_open");
      if (open === "products") setView({ k: "prods", cat: null, page: 0 });
      else if (open === "refer") setView({ k: "refer" });
      else if (open === "support") setView({ k: "support" });
    }
    if (localStorage.getItem("qorix_guest")) setView((v) => (v.k === "start" ? { k: "menu" } : v));
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      setAccountKey(data.session?.user.id ?? null);
      if (data.session) setView((v) => (v.k === "start" ? { k: "menu" } : v));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSignedIn(Boolean(sess));
      setAccountKey(sess?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const begin = () => setView(signedIn || localStorage.getItem("qorix_guest") ? { k: "menu" } : { k: "choose" });
  const acct = (to: string, what: string, icon: LucideIcon, label: string, tone: "blue" | "green" = "blue") =>
    signedIn ? <KeyLink premium={`menu_icon_${what}`} tone={tone} icon={icon} to={to}>{label}</KeyLink>
      : <Key premium={`menu_icon_${what}`} tone={tone} icon={icon} onClick={() => setView({ k: "guest", what })}>{label}</Key>;
  useEffect(() => {
    const target = scroller.current;
    if (!target) return;
    target.scrollTo({ top: view.k === "menu" ? 0 : target.scrollHeight, behavior: "smooth" });
  }, [view]);

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
            From payment to password in seconds — premium AI, streaming and creative tools, delivered automatically.
          </p>
        </Bubble>
      </div>
    );
  } else if (view.k === "choose") {
    body = (
      <>
        <Bubble>
          <p className="flex items-center gap-2 text-base font-bold"><Sparkles className="h-5 w-5 text-tg-quote-bar" /> How do you want to continue?</p>
          <Quote>
            <MenuLine icon={User} t="Guest" d="Shop and order instantly — no account needed" />
            <MenuLine premium="site_web_icon_connect_menu" icon={Send} t="Connect Telegram" d="Use your bot account: same ID, wallet balance, orders, deposits and referral link" />
          </Quote>
        </Bubble>
        <Keys cols={1}>
          <Key icon={User} onClick={() => { localStorage.setItem("qorix_guest", "1"); setView({ k: "menu" }); }}>Continue as Guest</Key>
          <Key premium="site_web_icon_connect_button" tone="green" icon={Send} onClick={() => setView({ k: "tg" })}>Connect Telegram</Key>
        </Keys>
        <Keys cols={2}>
          <KeyLink icon={LogIn} to="/auth" search={{ mode: "in" }}>Sign in</KeyLink>
          <KeyLink tone="green" icon={UserPlus} to="/auth" search={{ mode: "up" }}>Sign up</KeyLink>
        </Keys>
      </>
    );
  } else if (view.k === "tg") {
    body = <TelegramConnect onDone={() => { localStorage.setItem("qorix_guest", "1"); setView({ k: "menu" }); }} onBack={() => setView({ k: "choose" })} />;
  } else if (view.k === "guest") {
    body = (
      <>
        <Bubble>
          <p className="flex items-center gap-2 font-bold"><ButtonPremiumIcon setting="site_web_icon_connect_heading" fallback={Send} /> Connect Telegram</p>
          <Quote>{view.what === "wallet" ? "To deposit, connect your Telegram account or sign in." : view.what === "referral"
            ? "Want to earn by referring friends? Connect your Telegram account to see your referral link and rewards."
            : "Your wallet, deposits and profile live in your Telegram bot account. Connect Telegram to use them here."}</Quote>
          <p className="mt-2 text-sm italic">As a guest you can still buy any product and track orders by email.</p>
        </Bubble>
        <Keys cols={1}>
          <Key premium="site_web_icon_connect_button" tone="green" icon={Send} onClick={() => setView({ k: "tg" })}>Connect Telegram</Key>
          {view.what === "wallet" && <KeyLink icon={LogIn} to="/auth" search={{ mode: "in", deposit: true }}>Sign in</KeyLink>}
          <KeyLink icon={Package} to="/track">Track my order</KeyLink>
          <Key premium="menu_icon_back" tone="red" icon={ChevronLeft} onClick={() => setView({ k: "menu" })}>Main Menu</Key>
        </Keys>
      </>
    );
  } else if (view.k === "support") {
    body = <BotSupportView signedIn={signedIn} go={go} />;
  } else if (view.k === "api") {
    body = <BotApiPanel signedIn={signedIn} onConnect={() => setView({ k: "tg" })} onHome={() => setView({ k: "menu" })} onWallet={() => { void navigate({ to: "/account", search: { deposit: true } }); }} />;
  } else if (view.k === "refer") {
    body = <BotReferralView signedIn={signedIn} go={go} />;
  } else if (view.k === "free") {
    const free = products.filter((p) => Number(p.price) <= 0 && p.in_stock !== false);
    body = (
      <>
        <Bubble>
          <p className="flex items-center gap-2 font-bold tracking-[0.3em]"><Gift className="h-5 w-5 text-tg-quote-bar" /> FREEBIES</p>
          <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />
          {free.length ? <p className="text-sm">Every product below can be claimed <b>FREE</b> once per its free window.</p>
            : <><p className="text-sm">No freebies right now. Check back later!</p><p className="mt-2 text-sm italic">No offer found — no free offers are running right now.</p></>}
        </Bubble>
        {free.length > 0 && <Keys cols={1}>{free.map((p) => <Key key={p.id} leading={<ProductPremiumIcon productId={p.id} fallback={imgOf(p) ? <img src={imgOf(p)} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" /> : <Gift className="h-4 w-4 shrink-0" />} />} img={imgOf(p)} icon={Gift} onClick={() => setView({ k: "prod", id: p.id, from: view })}>{stripEmoji(p.name)} | FREE</Key>)}</Keys>}
        <Keys cols={1}><Key premium="ui_icon_prod_refresh" tone="green" icon={RefreshCw} onClick={() => setView({ k: "free" })}>Refresh</Key></Keys>
        <Keys cols={2}>
          <Key tone="green" icon={ShoppingCart} onClick={() => setView({ k: "prods", cat: null, page: 0 })}>Open Shop</Key>
          <Key premium="ui_icon_prod_back" tone="red" icon={ArrowLeft} onClick={() => setView({ k: "menu" })}>Back</Key>
        </Keys>
      </>
    );
  } else if (view.k === "menu") {
    body = (
      <>
        <BotStartProfile signedIn={signedIn} accountKey={accountKey} onConnect={() => setView({ k: "tg" })} />
        <Keys cols={1}>
          <KeyLink tone="green" icon={LayoutDashboard} to="/reseller/start">Reseller Dashboard</KeyLink>
        </Keys>
        <Keys cols={3}>
          <Key premium="menu_icon_shop" icon={Store} onClick={() => setView({ k: "cats" })}>SHOP</Key>
          <Key premium="ui_icon_prod_cart" icon={ShoppingCart} onClick={() => setView({ k: "prods", cat: null, page: 0 })}>Cart</Key>
          {signedIn ? <KeyLink premium="menu_icon_orders" icon={Package} to="/account/orders">Orders</KeyLink> : <KeyLink premium="menu_icon_orders" icon={Package} to="/track">Orders</KeyLink>}
          {acct("/account", "wallet", Wallet, "Wallet")}
          <Key premium="menu_icon_freebies" icon={Gift} onClick={() => setView({ k: "free" })}>Freebies</Key>
          {acct("/account/profile", "profile", User, "Profile")}
        </Keys>
        <Keys cols={1}><Key premium="menu_icon_referral" tone="green" icon={Gift} onClick={() => setView({ k: "refer" })}>Referral Store</Key></Keys>
        <Keys cols={2}>
          <Key premium="menu_icon_support" tone="green" icon={LifeBuoy} onClick={() => setView({ k: "support" })}>Support</Key>
          <a href={supportInfo?.emails ?? "https://mailreader.click/"} target="_blank" rel="noreferrer" className={keyCls("green")}><KeyInner premium="menu_icon_emails" icon={Mail}>Emails & Trials</KeyInner></a>
          <Key premium="menu_icon_api" tone="green" icon={Code2} onClick={() => setView({ k: "api" })}>Reseller API</Key>
          <Key premium="menu_icon_clear" tone="green" icon={Trash2} onClick={() => { setView({ k: "cats" }); setTimeout(() => setView({ k: "menu" }), 0); }}>Clear Chat</Key>
        </Keys>
        {signedIn && (
          <Keys cols={1}>
            <Key tone="red" icon={CircleX} onClick={async () => { await supabase.auth.signOut(); localStorage.removeItem("qorix_guest"); setView({ k: "start" }); }}>Disconnect Telegram</Key>
          </Keys>
        )}
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
        <Keys cols={1}><Key premium="cat_icon_all" tone="green" icon={Zap} onClick={() => setView({ k: "prods", cat: null, page: 0 })}>All products ({inStockCount})</Key></Keys>
        <Keys cols={categories.length > 8 ? 3 : 2}>
          {categories.map((c) => {
            const premium = categoryPremiumMedia(c.id);
            return <Key key={c.id} leading={premium ? <CategoryPremiumIcon media={premium} /> : undefined}
              img={premium ? undefined : mobileImageFor(props.catImages, c.id, c.image_url) || undefined}
              icon={LayoutGrid} onClick={() => setView({ k: "prods", cat: c.id, page: 0 })}>{stripEmoji(c.name)}</Key>;
          })}
        </Keys>
        {props.loading && <p className="text-center text-xs text-tg-bubble-fg">Loading…</p>}
        <Keys cols={2}>
          <Key premium="menu_icon_refresh" tone="green" icon={RefreshCw} onClick={() => setView({ k: "cats" })}>Refresh Stock</Key>
          <Key premium="menu_icon_back" tone="red" icon={ChevronLeft} onClick={() => setView({ k: "menu" })}>Main Menu</Key>
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
              leading={<ProductPremiumIcon productId={p.id} fallback={imgOf(p) ? <img src={imgOf(p)} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" /> : <Package className="h-4 w-4 shrink-0" />} />}
              onClick={() => setView({ k: "prod", id: p.id, from: view })}>
              {stripEmoji(p.name)} | {money(p.price)} | <ButtonPremiumIcon setting="ui_icon_prod_stock" fallback={Boxes} /> {Number(p.stock ?? 0)}
            </Key>
          ))}
          {slice.length === 0 && <p className="text-center text-sm text-tg-bubble-fg">No products here yet.</p>}
        </Keys>
        {pages > 1 && (
          <Keys cols={2}>
            <Key premium="menu_icon_prev" icon={ChevronLeft} disabled={view.page === 0} onClick={() => setView({ ...view, page: view.page - 1 })}>Prev</Key>
            <Key premium="menu_icon_next" icon={ChevronRight} disabled={view.page >= pages - 1} onClick={() => setView({ ...view, page: view.page + 1 })}>Next ({view.page + 1}/{pages})</Key>
          </Keys>
        )}
        <Keys cols={1}>
          <Key premium="menu_icon_refresh" tone="green" icon={RefreshCw} onClick={() => setView({ ...view })}>Refresh Stock</Key>
          <Key premium="ui_icon_shop_back_cat" tone="green" icon={LayoutGrid} onClick={() => setView({ k: "cats" })}>Back to Categories</Key>
        </Keys>
        <Keys cols={2}>
          <Key premium="ui_icon_prod_cart" tone="green" icon={ShoppingCart} onClick={() => setView({ k: "prods", cat: null, page: 0 })}>Cart</Key>
          <Key premium="menu_icon_back" tone="red" icon={ChevronLeft} onClick={() => setView({ k: "menu" })}>Main Menu</Key>
        </Keys>
      </>
    );
  } else {
    const p = productById(view.id);
    const back = view.k === "qty" ? { k: "prod" as const, id: view.id, from: view.from } : view.from;
    if (!p) body = <Bubble>This product is no longer available.</Bubble>;
    else if (view.k === "prod") {
      const sold = p.in_stock === false;
      body = (
        <div className="w-full self-start">
          <BotProductMessage product={p} />
          <div className="mt-px grid grid-cols-2 gap-px [&_button]:rounded-md [&_a]:rounded-md [&_button]:text-base [&_a]:text-base [&_button]:font-medium [&_a]:font-medium [&_button]:shadow-none [&_a]:shadow-none [&_button]:bg-tg-btn-green/80 [&_a]:bg-tg-btn-green/80 [&_button]:hover:bg-tg-btn-green [&_a]:hover:bg-tg-btn-green [&_span]:whitespace-normal [&_span]:break-words">
          {sold ? (
            <div className="col-span-2 grid gap-px">
              <Key premium="ui_icon_prod_out" tone="green" icon={CircleX}>Out of stock</Key>
              <KeyLink premium="ui_icon_prod_notify" tone="green" icon={Bell} to="/store/$id" params={{ id: p.slug ?? p.id }}>Notify Me When Available</KeyLink>
            </div>
          ) : (
            <>
              <Key premium="ui_icon_prod_buy" tone="green" icon={ShoppingCart} onClick={() => setView({ k: "qty", id: p.id, from: view.from })}>Buy Now</Key>
              <KeyLink premium="ui_icon_prod_addcart" tone="green" icon={Plus} to="/checkout" search={{ id: p.id, qty: 1, step: "details" }}>Add to Cart</KeyLink>
            </>
          )}
            <Key premium="ui_icon_prod_refresh" tone="green" icon={RefreshCw} onClick={() => { void queryClient.invalidateQueries({ queryKey: ["store-product", p.id] }); setView({ ...view }); }}>Refresh</Key>
            <div className="grid [&_button]:bg-tg-btn-red/80 [&_button]:hover:bg-tg-btn-red"><Key premium="ui_icon_prod_back" tone="red" icon={ArrowLeft} onClick={() => setView(back)}>Back</Key></div>
            <Key premium="ui_icon_prod_cart" tone="green" icon={ShoppingCart} onClick={() => setView({ k: "prods", cat: null, page: 0 })}>Cart</Key>
            <Key premium="ui_icon_prod_home" tone="green" icon={Home} onClick={() => setView({ k: "menu" })}>Home</Key>
          </div>
        </div>
      );
    } else body = <QtyPicker p={p} onBack={() => setView(back)} />;
  }

  return (
    <BotFrame scrollRef={scroller}
      onBack={() => setView(view.k === "start" || view.k === "choose" || view.k === "tg" ? (signedIn ? { k: "menu" } : { k: "start" }) : { k: "menu" })}
      onMenu={() => setView({ k: "menu" })}
      footer={view.k === "start" ? (
        <button type="button" onClick={begin}
          className="w-full rounded-2xl bg-tg-header py-3.5 text-base font-bold uppercase tracking-wide text-tg-link shadow-sm backdrop-blur">
          Start
        </button>
      ) : (
        <div className={bottomBarCls}>
          <button type="button" onClick={() => setView({ k: "prods", cat: null, page: 0 })} className={bottomCls}><ButtonPremiumIcon setting="menu_icon_bottom_products" fallback={LayoutGrid} /><span className="truncate">Products</span></button>
          {signedIn ? <Link to="/account" className={bottomCls}><ButtonPremiumIcon setting="menu_icon_bottom_deposit" fallback={Wallet} /><span className="truncate">Deposit</span></Link>
            : <button type="button" onClick={() => setView({ k: "guest", what: "wallet" })} className={bottomCls}><ButtonPremiumIcon setting="menu_icon_bottom_deposit" fallback={Wallet} /><span className="truncate">Deposit</span></button>}
          <Link to={signedIn ? "/account/orders" : "/track"} className={bottomCls}><ButtonPremiumIcon setting="menu_icon_bottom_orders" fallback={Package} /><span className="truncate">My Orders</span></Link>
        </div>
      )}>
      {body}
    </BotFrame>
  );
}

export function TelegramConnect({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const startLogin = useServerFn(startTelegramLogin);
  const claimLogin = useServerFn(claimTelegramLogin);
  const [s, setS] = useState<{ code: string; secret: string; botUser: string } | null>(null);
  const [msg, setMsg] = useState("Preparing your secure login link…");
  const start = () => {
    setS(null); setMsg("Preparing your secure login link…");
    startLogin().then((r) => { setS(r); setMsg("Tap Open Telegram, then press START in the bot to authorize."); })
      .catch(() => setMsg("Could not start Telegram login. Please try again."));
  };
  useEffect(start, []);
  useEffect(() => {
    if (!s) return;
    let stop = false;
    let claiming = false;
    const t = setInterval(async () => {
      if (claiming) return;
      claiming = true;
      try {
        const r = await claimLogin({ data: { code: s.code, secret: s.secret } });
        if (stop) return;
        if (r.status === "ok") {
          clearInterval(t);
          setMsg("Authorized — signing you in…");
          const { error } = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: "magiclink" });
          if (error) setMsg("Sign-in failed. Please try again."); else onDone();
        } else if (r.status !== "waiting") {
          clearInterval(t);
          setMsg(r.status === "expired" ? "This login link expired. Tap Try again." : r.status === "unavailable" ? "This Telegram account is not available." : "Login could not be completed. Tap Try again.");
        }
      } catch { /* keep polling */ }
      finally { claiming = false; }
    }, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [s]);
  const href = s ? `https://t.me/${s.botUser}?start=wlg_${s.code}` : undefined;
  return (
    <>
      <Bubble>
        <p className="flex items-center gap-2 font-bold"><ButtonPremiumIcon setting="site_web_icon_connect_heading" fallback={Send} /> Connect Telegram</p>
        <Quote>After you authorize in the bot, this website shows your same bot account — ID, wallet balance, orders, deposits and referral link.</Quote>
        <p className="mt-2 text-sm italic">{msg}</p>
        <p className="mt-1 text-xs text-tg-muted">The link works once and expires in 10 minutes.</p>
      </Bubble>
      <Keys cols={1}>
        {href && <Button asChild variant="ghost" className={`${keyCls("green")} h-auto hover:opacity-90`}><a href={href} target="_blank" rel="noreferrer"><KeyInner premium="site_web_icon_open_telegram" icon={Send}>Open Telegram</KeyInner></a></Button>}
        <Key icon={RefreshCw} onClick={start}>Try again</Key>
        <Key premium="ui_icon_qty_back" tone="red" icon={ArrowLeft} onClick={onBack}>Back</Key>
      </Keys>
    </>
  );
}

export function QtyPicker({ p, onBack, initialQuantity = 1 }: { p: Prod; onBack: () => void; initialQuantity?: number }) {
  const [qty, setQty] = useState(initialQuantity);
  const [custom, setCustom] = useState("");
  const max = p.stock == null ? 100000 : Math.max(1, Number(p.stock) || 1);
  const total = useMemo(() => Number(p.price) * qty, [p.price, qty]);
  return (
    <>
      <Bubble>
        <p className="flex items-center gap-2 font-bold"><ButtonPremiumIcon setting="ui_icon_qty_title" fallback={ShoppingCart} /> Select quantity</p>
        <hr className="my-2 w-40 border-tg-bubble-fg/40" />
        <p className="flex items-center gap-2 uppercase"><ProductPremiumIcon productId={p.id} /><span className="min-w-0 break-words">{stripEmoji(p.name)}</span></p>
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
        <Key premium="ui_icon_qty_add1" icon={Plus} disabled={qty >= max} onClick={() => setQty((q) => Math.min(max, q + 1))}>More</Key>
      </Keys>
      <form className="flex gap-1.5" onSubmit={(e) => {
        e.preventDefault();
        const q = Math.floor(Number(custom));
        if (!Number.isFinite(q) || q < 1) return;
        setQty(Math.min(max, q)); setCustom("");
      }}>
        <input type="number" inputMode="numeric" min={1} max={max} value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Custom quantity" aria-label="Custom quantity" className="min-h-11 w-full min-w-0 flex-1 rounded-xl border border-tg-bubble-fg/15 bg-tg-bubble px-3 text-sm outline-none focus:border-tg-link" />
        <Button type="submit" variant="ghost" className="min-h-11 rounded-xl bg-tg-btn-green px-4 text-sm font-semibold text-tg-btn-fg shadow-sm"><ButtonPremiumIcon setting="ui_icon_qty_custom" />Confirm</Button>
      </form>
      <Keys cols={1}>
        <KeyLink premium="ui_icon_co_pay" tone="green" icon={Send} to="/checkout" search={{ id: p.id, qty, step: "details" }}>Checkout · {money(total)}</KeyLink>
        <Key premium="ui_icon_qty_back" tone="red" icon={ArrowLeft} onClick={onBack}>Back</Key>
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
function MenuLine({ icon: I, premium, t, d }: { icon: LucideIcon; premium?: string; t: string; d: string }) {
  return <p className="flex items-start gap-2 py-0.5">{premium ? <ButtonPremiumIcon setting={premium} fallback={I} /> : <I className="mt-0.5 h-4 w-4 shrink-0 text-tg-quote-bar" />}<span className="min-w-0"><b>{t}</b> — {d}</span></p>;
}
export function Keys({ cols, children }: { cols: 1 | 2 | 3; children: ReactNode }) {
  const c = cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";
  return <div className={`grid ${c} gap-1.5`}>{children}</div>;
}
type Tone = "blue" | "green" | "red";
const toneCls: Record<Tone, string> = { blue: "bg-tg-btn", green: "bg-tg-btn-green", red: "bg-tg-btn-red" };
const keyCls = (tone: Tone, active?: boolean) =>
  `flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-tg-btn-fg shadow-sm transition active:scale-[0.98] disabled:opacity-50 ${toneCls[tone]} ${active ? "ring-2 ring-tg-btn-fg" : ""}`;
function KeyInner({ icon: I, img, leading, premium, children }: { icon?: LucideIcon | undefined; img?: string | undefined; leading?: ReactNode; premium?: string | undefined; children: ReactNode }) {
  return (
    <>
      {leading ?? (img ? <img src={img} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-md bg-tg-bubble object-cover" />
        : premium ? <ButtonPremiumIcon setting={premium} fallback={I} /> : I ? <I className="h-4 w-4 shrink-0" /> : null)}
      <span className="truncate">{children}</span>
    </>
  );
}
export function Key({ tone = "blue", icon, img, leading, premium, children, onClick, disabled, active }: {
  tone?: Tone; icon?: LucideIcon | undefined; img?: string | undefined; leading?: ReactNode; premium?: string | undefined; children: ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean;
}) {
  return <Button type="button" variant="ghost" onClick={onClick} disabled={disabled} className={`${keyCls(tone, active)} h-auto hover:opacity-90`}><KeyInner icon={icon} img={img} leading={leading} premium={premium}>{children}</KeyInner></Button>;
}
export function KeyLink({ tone = "blue", icon, premium, children, ...link }: { tone?: Tone; icon?: LucideIcon; premium?: string; children: ReactNode } & Record<string, any>) {
  return <Link {...(link as any)} className={keyCls(tone)}><KeyInner icon={icon} premium={premium}>{children}</KeyInner></Link>;
}
