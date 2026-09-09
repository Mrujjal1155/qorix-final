import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowUp,
  Facebook,
  Home,
  Instagram,
  LogIn,
  Mail,
  MapPin,
  Menu,
  Package,
  PackageSearch,
  Phone,
  Search,
  Send,
  ShoppingCart,
  Twitter,
  UserRound,
  Check,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/theme";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePrefs, CURRENCIES, type Currency } from "@/lib/prefs";
import { CountryFlag } from "@/components/CountryFlag";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CURRENCY_FLAG: Record<Currency, string> = {
  USD: "US",
  BRL: "BR",
  EUR: "EU",
  INR: "IN",
  PKR: "PK",
  BDT: "BD",
  NGN: "NG",
  SAR: "SA",
};
import { useT } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useSiteContent } from "@/lib/use-site-content";
import { siteContacts, sitePayments, type SiteLink } from "@/lib/site-content";
import { Clock } from "lucide-react";

function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);
  return signedIn;
}

function SiteAnchor({ link, className }: { link: SiteLink; className?: string }) {
  const t = useT();
  const label = t(link.label);
  if (/^https?:\/\//i.test(link.href) || link.href.startsWith("mailto:") || link.href.startsWith("tel:")) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={className}>
        {label}
      </a>
    );
  }
  return (
    <Link to={link.href as never} className={className}>
      {label}
    </Link>
  );
}

function NavItem({ link, className }: { link: SiteLink; className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = link.href === pathname || (link.href !== "/" && pathname.startsWith(link.href));
  return (
    <SiteAnchor
      link={link}
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
        "hover:bg-primary/12 hover:text-primary hover:shadow-md hover:shadow-primary/15 hover:scale-[1.03]",
        isActive
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "text-muted-foreground",
        className
      )}
    />
  );
}

function CurrencySwitch() {
  const { currency, auto, setCurrency } = usePrefs();
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("Change currency")}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:border-primary/50"
        >
          <CountryFlag country={CURRENCY_FLAG[currency]} className="h-3.5 w-5 shrink-0 rounded-[3px]" />
          {currency}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => setCurrency("auto")} className="flex items-center gap-2.5">
          <span className="flex-1 text-sm">{t("Auto (by language)")}</span>
          {auto ? <Check className="h-4 w-4 text-primary" /> : null}
        </DropdownMenuItem>
        {CURRENCIES.map((c) => (
          <DropdownMenuItem key={c} onSelect={() => setCurrency(c)} className="flex items-center gap-2.5">
            <CountryFlag country={CURRENCY_FLAG[c]} className="h-4 w-[22px] shrink-0 rounded-[3px] shadow-sm" />
            <span className="flex-1 text-sm font-medium">{c}</span>
            {!auto && currency === c ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.38-1.99-1.23-.74-.65-1.23-1.46-1.38-1.71-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.44.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.02 2.57c.12.16 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M21.94 4.3 18.9 19.1c-.23 1.02-.84 1.27-1.7.79l-4.7-3.47-2.27 2.19c-.25.25-.46.46-.94.46l.34-4.8 8.73-7.9c.38-.34-.08-.53-.59-.19L6.98 13.2l-4.64-1.45c-1.01-.32-1.03-1.01.21-1.5L20.63 2.9c.84-.31 1.58.2 1.31 1.4Z" />
    </svg>
  );
}

const SOCIAL_ICONS: Record<string, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  telegram: TelegramIcon as unknown as typeof Facebook,
  twitter: Twitter,
  whatsapp: WhatsAppIcon as unknown as typeof Facebook,
};

const SOCIAL_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  facebook: { color: "#1877F2", bg: "rgba(24,119,242,0.12)", border: "rgba(24,119,242,0.45)" },
  instagram: { color: "#E1306C", bg: "rgba(225,48,108,0.12)", border: "rgba(225,48,108,0.45)" },
  telegram: { color: "#229ED9", bg: "rgba(34,158,217,0.12)", border: "rgba(34,158,217,0.45)" },
  twitter: { color: "#1DA1F2", bg: "rgba(29,161,242,0.12)", border: "rgba(29,161,242,0.45)" },
  whatsapp: { color: "#25D366", bg: "rgba(37,211,102,0.12)", border: "rgba(37,211,102,0.45)" },
  youtube: { color: "#FF0000", bg: "rgba(255,0,0,0.12)", border: "rgba(255,0,0,0.45)" },
  linkedin: { color: "#0A66C2", bg: "rgba(10,102,194,0.12)", border: "rgba(10,102,194,0.45)" },
};


const CONTACT_ICONS: Record<string, typeof Mail> = {
  mail: Mail,
  email: Mail,
  phone: Phone,
  whatsapp: WhatsAppIcon as unknown as typeof Mail,
  map: MapPin,
  address: MapPin,
  telegram: TelegramIcon as unknown as typeof Mail,
  clock: Clock,
};


function FooterColumn({ title, links }: { title: string; links: SiteLink[] }) {
  const t = useT();
  if (!links.length) return null;
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground">{t(title)}</h2>
      <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
        {links.map((l, i) => (
          <li key={`${l.label}-${i}`}>
            <SiteAnchor link={l} className="transition-colors hover:text-primary" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StoreShell({ children }: { children: ReactNode }) {
  const signedIn = useSignedIn();
  const t = useT();
  const { site, v, links } = useSiteContent();
  const [showTop, setShowTop] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const nav = links("site_nav");
  const socials = links("site_socials");
  const payments = sitePayments(site);
  const more = links("site_footer_categories_more")[0];
  const whatsapp = v("site_whatsapp");
  const brandLogo = v("site_brand_logo");
  const copyright = v("site_copyright").replace("{year}", String(new Date().getFullYear()));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex shrink-0 items-center">
            <BrandLogo src={brandLogo} name={v("site_brand_name")} className="h-10 w-auto object-contain sm:h-14" textClassName="text-xl sm:text-2xl" />
          </Link>

          <nav className="mx-auto hidden items-center gap-1 lg:flex">
            {nav.map((n, i) => (
              <NavItem key={`${n.label}-${i}`} link={n} />
            ))}
            <Link
              to="/reseller"
              className={cn(
                "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
                pathname === "/reseller"
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "text-primary",
                "hover:bg-primary hover:text-primary-foreground hover:shadow-lg hover:shadow-primary/30 hover:scale-[1.03]"
              )}
            >
              {t("Reseller")}
            </Link>
          </nav>

          {/* desktop controls */}
          <div className="ml-auto hidden items-center gap-1.5 lg:flex">
            <Link
              to="/store"
              aria-label={t("Search products")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Search className="h-4 w-4" />
            </Link>
            <LanguageSwitcher />
            <CurrencySwitch />
            <ThemeToggle />
            {signedIn ? (
              <Link
                to="/account"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label={t("My account")}
              >
                <UserRound className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                to="/auth"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label={t("Log in")}
              >
                <LogIn className="h-4 w-4" />
              </Link>
            )}
            <Link
              to="/track"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={t("Track order")}
            >
              <PackageSearch className="h-4 w-4" />
            </Link>
            <Link
              to="/store"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={t("Open the store")}
            >
              <ShoppingCart className="h-4 w-4" />
            </Link>
          </div>

          {/* mobile: hamburger menu */}
          <div className="ml-auto lg:hidden">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label={t("Open menu")}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary/60 text-foreground"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 max-w-[85vw] overflow-y-auto p-0">
                <SheetHeader className="border-b border-border/60 p-4">
                  <SheetTitle className="flex items-center">
                    <BrandLogo src={brandLogo} name={v("site_brand_name")} className="h-10 w-auto object-contain" textClassName="text-xl" />
                  </SheetTitle>
                </SheetHeader>

                <nav className="flex flex-col gap-1 p-3">
                  {nav.map((n, i) => {
                    const active = n.href === pathname || (n.href !== "/" && pathname.startsWith(n.href));
                    return (
                      <span key={`m-${n.label}-${i}`} onClick={() => setMenuOpen(false)}>
                        <SiteAnchor
                          link={n}
                          className={cn(
                            "block rounded-xl px-4 py-3 text-base font-semibold transition-all duration-200",
                            active
                              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                              : "text-foreground hover:bg-primary/10 hover:text-primary"
                          )}
                        />
                      </span>
                    );
                  })}
                  <Link
                    to="/reseller"
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "block rounded-xl px-4 py-3 text-base font-semibold transition-all duration-200",
                      pathname === "/reseller"
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "text-primary hover:bg-primary hover:text-primary-foreground"
                    )}
                  >
                    {t("Become a Reseller")}
                  </Link>
                  <Link
                    to="/reseller/panel"
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "block rounded-xl px-4 py-3 text-base font-semibold transition-all duration-200",
                      pathname === "/reseller/panel"
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "text-foreground hover:bg-primary/10 hover:text-primary"
                    )}
                  >
                    {t("Reseller Panel")}
                  </Link>
                  <Link
                    to="/reseller/docs"
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "block rounded-xl px-4 py-3 text-base font-semibold transition-all duration-200",
                      pathname === "/reseller/docs"
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "text-foreground hover:bg-primary/10 hover:text-primary"
                    )}
                  >
                    {t("API Documentation")}
                  </Link>
                </nav>

                <div className="space-y-4 border-t border-border/60 p-4">
                  <div className="flex items-center gap-2">
                    <LanguageSwitcher />
                    <CurrencySwitch />
                    <ThemeToggle />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/store"
                      onClick={() => setMenuOpen(false)}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm font-medium"
                    >
                      <Search className="h-4 w-4 text-muted-foreground" /> {t("Search")}
                    </Link>
                    <Link
                      to="/store"
                      onClick={() => setMenuOpen(false)}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm font-medium"
                    >
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" /> {t("Cart")}
                    </Link>
                    <Link
                      to="/track"
                      onClick={() => setMenuOpen(false)}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm font-medium"
                    >
                      <PackageSearch className="h-4 w-4 text-muted-foreground" /> {t("Track order")}
                    </Link>
                    {signedIn ? (
                      <Link
                        to="/account"
                        onClick={() => setMenuOpen(false)}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm font-medium"
                      >
                        <UserRound className="h-4 w-4 text-muted-foreground" /> {t("Account")}
                      </Link>
                    ) : (
                      <Link
                        to="/auth"
                        onClick={() => setMenuOpen(false)}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm font-medium"
                      >
                        <LogIn className="h-4 w-4 text-muted-foreground" /> {t("Log in")}
                      </Link>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/70 bg-background pb-24 lg:pb-0">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-5">
            <div className="col-span-2 lg:col-span-1">
              <BrandLogo src={brandLogo} name={v("site_brand_name")} className="h-12 w-auto object-contain" textClassName="text-2xl" />
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">{t(v("site_tagline"))}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {socials.map((s, i) => {
                  const key = s.label.toLowerCase();
                  const Icon = SOCIAL_ICONS[key] ?? Send;
                  const style = SOCIAL_STYLES[key];
                  return (
                    <a
                      key={`${s.label}-${i}`}
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={s.label}
                      style={
                        style
                          ? { color: style.color, backgroundColor: style.bg, borderColor: style.border }
                          : undefined
                      }
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-secondary/40 text-muted-foreground transition-transform hover:scale-110"
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  );
                })}
              </div>
            </div>

            <div>
              <FooterColumn title={v("site_footer_categories_title")} links={links("site_footer_categories")} />
              {more ? (
                <a
                  href={more.href}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  {more.label} <ArrowRight className="h-4 w-4" />
                </a>
              ) : null}
            </div>

            <FooterColumn title={v("site_footer_quick_title")} links={links("site_footer_quick")} />
            <div>
              <FooterColumn title={v("site_footer_support_title")} links={links("site_footer_support")} />
              <div className="mt-5 space-y-2 text-sm">
                <Link to="/reseller" className="block font-medium text-primary hover:underline">
                  {t("Apply as Reseller")}
                </Link>
                <Link to="/reseller/panel" className="block text-muted-foreground hover:text-primary">
                  {t("Reseller Panel Login")}
                </Link>
                <Link to="/reseller/docs" className="block text-muted-foreground hover:text-primary">
                  {t("API Documentation")}
                </Link>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">{v("site_footer_contact_title")}</h2>
              <ul className="mt-5 space-y-4 text-sm text-muted-foreground">
                {siteContacts(site).map((c, i) => {
                  const Icon = CONTACT_ICONS[c.icon.toLowerCase()] ?? Mail;
                  const inner = (
                    <>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        {c.label ? (
                          <span className="block text-xs font-semibold uppercase tracking-wide text-foreground/80">
                            {c.label}
                          </span>
                        ) : null}
                        <span className="block break-words">{c.value}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={`${c.label}-${i}`}>
                      {c.link ? (
                        <a
                          href={c.link}
                          target={/^https?:/i.test(c.link) ? "_blank" : undefined}
                          rel="noreferrer"
                          className="flex items-start gap-3 transition-colors hover:text-primary"
                        >
                          {inner}
                        </a>
                      ) : (
                        <span className="flex items-start gap-3">{inner}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {payments.length ? (
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3 border-t border-border/60 pt-8">
              <span className="mr-2 text-sm font-medium text-muted-foreground">{t(v("site_payments_label"))}</span>
              {payments.map((p, i) =>
                p.image ? (
                  <span
                    key={`${p.label}-${i}`}
                    className="inline-flex h-9 min-w-[74px] items-center justify-center overflow-hidden rounded-md border border-border/70 px-2"
                    style={{ backgroundColor: p.bg || undefined }}
                    title={p.label}
                  >
                    <img src={p.image} alt={p.label} loading="lazy" className="max-h-6 w-auto object-contain" />
                  </span>
                ) : (
                  <span
                    key={`${p.label}-${i}`}
                    className="inline-flex h-9 min-w-[74px] items-center justify-center rounded-md border border-border/70 px-3 text-[11px] font-bold tracking-wide"
                    style={{ backgroundColor: p.bg || undefined, color: p.color || "#fff" }}
                  >
                    {p.label}
                  </span>
                ),
              )}
            </div>
          ) : null}

          <div className="mt-8 border-t border-border/60 pt-6 text-center text-sm text-muted-foreground">
            {copyright}
          </div>
        </div>
      </footer>

      {/* mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-4">
          <Link
            to="/"
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
              pathname === "/" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Home className="h-5 w-5" />
            Home
          </Link>
          <Link
            to="/store"
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
              pathname.startsWith("/store") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Package className="h-5 w-5" />
            Products
          </Link>
          <Link
            to="/track"
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
              pathname.startsWith("/track") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <ShoppingCart className="h-5 w-5" />
            Cart
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground"
          >
            <Menu className="h-5 w-5" />
            Menu
          </button>
        </div>
      </nav>

      <div className="pointer-events-none fixed bottom-24 right-4 z-50 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
        {v("site_show_scrolltop") !== "0" && showTop ? (
          <button
            type="button"
            aria-label="Back to top"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 bg-background/80 text-primary shadow-md backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground hover:shadow-lg"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        ) : null}
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            aria-label="Chat on WhatsApp"
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-success/40 bg-success text-success-foreground shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            {v("site_whatsapp_icon") ? (
              <img src={v("site_whatsapp_icon")} alt="WhatsApp" className="h-full w-full object-cover" />
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.8-.23-.09-.39-.13-.56.12-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.38-1.99-1.23-.74-.65-1.23-1.46-1.38-1.71-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.44.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.02 2.57c.12.16 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
              </svg>
            )}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function priceTag(n: unknown) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}
