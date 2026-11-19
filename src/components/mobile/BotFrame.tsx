import { ButtonPremiumIcon } from "@/components/mobile/ButtonPremiumIcon";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, EllipsisVertical, Home, Moon, Sun, LayoutGrid, Package, ShieldCheck, ShoppingBag, Wallet } from "lucide-react";
import { getPublicStats } from "@/lib/shop.functions";
import { useSiteContent } from "@/lib/use-site-content";
import { activeTemplate, MOBILE_LOGO_KEY, MOBILE_NAME_KEY, TEMPLATE_KEY } from "@/lib/mobile-template";

/** True when admin picked the Mobile View template. */
export function useMobileTemplate() {
  const { v } = useSiteContent();
  return activeTemplate(v(TEMPLATE_KEY)) === "mobile";
}

export function useBotHeader() {
  const { v } = useSiteContent();
  const { data: stats } = useQuery({ queryKey: ["public-stats"], queryFn: () => getPublicStats(), staleTime: 300_000 });
  return {
    name: v(MOBILE_NAME_KEY) || "QORIX-store",
    logo: v(MOBILE_LOGO_KEY) || v("site_brand_logo"),
    users: ((stats as any)?.users ?? null) as number | null,
  };
}

export function BotLogo({ src, size = "md", inline }: { src: string; size?: "md" | "lg"; inline?: boolean }) {
  const cls = (size === "lg" ? "h-20 w-20" : "h-11 w-11") + (inline ? " !mx-0" : "");
  return src ? (
    <img src={src} alt="Bot logo" className={`${cls} mx-auto shrink-0 rounded-full object-cover ring-2 ring-tg-bubble`} />
  ) : (
    <span className={`${cls} mx-auto grid shrink-0 place-items-center rounded-full bg-tg-btn text-tg-btn-fg`}><ShoppingBag className="h-1/2 w-1/2" /></span>
  );
}

const roundBtn = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tg-header shadow-sm backdrop-blur";
export const bottomCls = "flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-tg-btn px-2 text-sm font-bold text-tg-btn-fg";
/** White rounded pill bar that holds the 3 bottom buttons, like Telegram's pinned menu. */
export const bottomBarCls = "grid grid-cols-3 gap-1.5 rounded-full bg-tg-header p-1.5 shadow-md backdrop-blur";

/** Dark mode flag for Mobile View; stored in the browser, applied to <html> after hydration. */
export function useTgDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(localStorage.getItem("qorix_tg_dark") === "1"); }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("tg-dark", dark);
    return () => document.documentElement.classList.remove("tg-dark");
  }, [dark]);
  const toggle = () => setDark((d) => { localStorage.setItem("qorix_tg_dark", d ? "0" : "1"); return !d; });
  return { dark, toggle };
}

function HeaderMenu({ onMenu }: { onMenu?: (() => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const { dark, toggle } = useTgDark();
  const item = "flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-tg-bubble-fg/5";
  return (
    <div className="relative">
      <button type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={roundBtn}><EllipsisVertical className="h-5 w-5" /></button>
      {open && <>
        <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-xl bg-tg-bubble py-1 text-tg-bubble-fg shadow-xl">
          <button type="button" className={item} onClick={() => { toggle(); setOpen(false); }}>
            {dark ? <Sun className="h-5 w-5 text-tg-muted" /> : <Moon className="h-5 w-5 text-tg-muted" />}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          {onMenu ? (
            <button type="button" className={item} onClick={() => { setOpen(false); onMenu(); }}><ButtonPremiumIcon setting="ui_icon_prod_home" fallback={Home} />Main menu</button>
          ) : (
            <Link to="/" className={item} onClick={() => setOpen(false)}><ButtonPremiumIcon setting="ui_icon_prod_home" fallback={Home} />Main menu</Link>
          )}
        </div>
      </>}
    </div>
  );
}

/** Telegram chat window: header (logo, name, total users), wallpaper, scroll area, bottom keyboard. */
export function BotFrame({ children, footer, onBack, onMenu, scrollRef, bare }: {
  children: ReactNode; footer?: ReactNode; onBack?: () => void; onMenu?: () => void; bare?: boolean;
  scrollRef?: React.Ref<HTMLDivElement>;
}) {
  const h = useBotHeader();
  return (
    <div className="flex h-[100dvh] justify-center bg-tg-chat">
      <div className="tg-wallpaper relative flex h-full w-full max-w-md flex-col overflow-hidden text-tg-bubble-fg sm:border-x sm:border-tg-bubble-fg/10">
        <header className="z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 pt-2">
          {bare ? <span className="h-11 w-11" /> : onBack ? (
            <button type="button" aria-label="Back" onClick={onBack} className={roundBtn}><ArrowLeft className="h-5 w-5" /></button>
          ) : (
            <Link to="/" aria-label="Back" className={roundBtn}><ArrowLeft className="h-5 w-5" /></Link>
          )}
          <div className="flex min-w-0 items-center justify-start gap-2.5 rounded-full bg-tg-header py-1 pl-1 pr-4 shadow-sm backdrop-blur">
            <BotLogo src={h.logo} inline />
            <div className="min-w-0 flex-1 text-left leading-tight">
              <p className="flex items-center gap-1 truncate text-base font-bold">{h.name} <ShieldCheck className="h-4 w-4 shrink-0 text-tg-link" /></p>
              <p className="truncate text-xs text-tg-muted">{h.users == null ? "bot" : `${h.users.toLocaleString("en-US")} total users`}</p>
            </div>
          </div>
          {bare ? <span className="h-11 w-11" /> : <HeaderMenu onMenu={onMenu} />}
        </header>
        <div ref={scrollRef} className="tg-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-3">{children}</div>
        {!bare && <footer className="space-y-2 px-1.5 pb-1.5">
          {footer ?? (
            <div className={bottomBarCls}>
              <Link to="/" onClick={() => localStorage.setItem("qorix_open", "products")} className={bottomCls}><ButtonPremiumIcon setting="menu_icon_bottom_products" fallback={LayoutGrid} /><span className="truncate">Products</span></Link>
              <Link to="/account" className={bottomCls}><ButtonPremiumIcon setting="menu_icon_bottom_deposit" fallback={Wallet} /><span className="truncate">Deposit</span></Link>
              <Link to="/account/orders" className={bottomCls}><ButtonPremiumIcon setting="menu_icon_bottom_orders" fallback={Package} /><span className="truncate">My Orders</span></Link>
            </div>
          )}
        </footer>}
      </div>
    </div>
  );
}

/** Any normal website page shown as a bot message (light chat bubble) inside the frame. */
export function BotPage({ children }: { children: ReactNode }) {
  return (
    <BotFrame onBack={() => (typeof window !== "undefined" && window.history.length > 1 ? window.history.back() : undefined)}>
      <div className="tg-page w-full self-start overflow-hidden rounded-2xl rounded-bl-md bg-tg-bubble shadow-sm">{children}</div>
      <Link to="/" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn-red px-2 text-sm font-semibold text-tg-btn-fg shadow-sm">
        <ButtonPremiumIcon setting="menu_icon_back" fallback={ArrowLeft} /> Main Menu
      </Link>
    </BotFrame>
  );
}
