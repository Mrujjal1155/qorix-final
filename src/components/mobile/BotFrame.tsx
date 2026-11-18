import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ArrowLeft, EllipsisVertical, LayoutGrid, Package, ShieldCheck, ShoppingBag, Wallet } from "lucide-react";
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

export function BotLogo({ src, size = "md" }: { src: string; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "h-20 w-20" : "h-11 w-11";
  return src ? (
    <img src={src} alt="Bot logo" className={`${cls} mx-auto shrink-0 rounded-full object-cover ring-2 ring-tg-bubble`} />
  ) : (
    <span className={`${cls} mx-auto grid shrink-0 place-items-center rounded-full bg-tg-btn text-tg-btn-fg`}><ShoppingBag className="h-1/2 w-1/2" /></span>
  );
}

const roundBtn = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tg-header shadow-sm backdrop-blur";
export const bottomCls = "flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-tg-btn px-2 text-sm font-bold text-tg-btn-fg shadow-sm";

/** Telegram chat window: header (logo, name, total users), wallpaper, scroll area, bottom keyboard. */
export function BotFrame({ children, footer, onBack, onMenu, scrollRef }: {
  children: ReactNode; footer?: ReactNode; onBack?: () => void; onMenu?: () => void;
  scrollRef?: React.Ref<HTMLDivElement>;
}) {
  const h = useBotHeader();
  return (
    <div className="flex h-[100dvh] justify-center bg-tg-chat">
      <div className="tg-wallpaper relative flex h-full w-full max-w-md flex-col overflow-hidden text-tg-bubble-fg sm:border-x sm:border-tg-bubble-fg/10">
        <header className="z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 pt-2">
          {onBack ? (
            <button type="button" aria-label="Back" onClick={onBack} className={roundBtn}><ArrowLeft className="h-5 w-5" /></button>
          ) : (
            <Link to="/" aria-label="Back" className={roundBtn}><ArrowLeft className="h-5 w-5" /></Link>
          )}
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-tg-header py-1 pl-1 pr-4 shadow-sm backdrop-blur">
            <BotLogo src={h.logo} />
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate text-base font-bold">{h.name} <ShieldCheck className="h-4 w-4 shrink-0 text-tg-link" /></p>
              <p className="truncate text-xs text-tg-muted">{h.users == null ? "bot" : `${h.users.toLocaleString("en-US")} total users`}</p>
            </div>
          </div>
          {onMenu ? (
            <button type="button" aria-label="Menu" onClick={onMenu} className={roundBtn}><EllipsisVertical className="h-5 w-5" /></button>
          ) : (
            <Link to="/" aria-label="Menu" className={roundBtn}><EllipsisVertical className="h-5 w-5" /></Link>
          )}
        </header>
        <div ref={scrollRef} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-3">{children}</div>
        <footer className="space-y-2 px-2 pb-3">
          {footer ?? (
            <div className="grid grid-cols-3 gap-2">
              <Link to="/" onClick={() => localStorage.setItem("qorix_open", "products")} className={bottomCls}><LayoutGrid className="h-4 w-4 shrink-0" /><span className="truncate">Products</span></Link>
              <Link to="/account" className={bottomCls}><Wallet className="h-4 w-4 shrink-0" /><span className="truncate">Deposit</span></Link>
              <Link to="/account/orders" className={bottomCls}><Package className="h-4 w-4 shrink-0" /><span className="truncate">My Orders</span></Link>
            </div>
          )}
        </footer>
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
        <ArrowLeft className="h-4 w-4" /> Main Menu
      </Link>
    </BotFrame>
  );
}
