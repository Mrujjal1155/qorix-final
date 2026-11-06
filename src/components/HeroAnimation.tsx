import { useT } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { priceTag } from "@/components/StoreShell";
import type { StoreProduct } from "@/components/ProductCard";
import { brandFallbackOnError } from "@/components/SmartImage";
import {
  Bot,
  Check,
  CreditCard,
  Globe,
  KeyRound,
  MessageCircle,
  Search,
  Send,
  ShoppingBag,
  Zap,
} from "lucide-react";

export type HeroItem = {
  id?: string;
  name: string;
  image_url?: string | null;
  accent?: string | null;
};


/** Product logo. Always shows the uploaded logo; never a generic box icon. */
function Logo({
  src,
  name,
  className = "h-9 w-9",
  accent,
}: {
  src?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
  accent?: string | null | undefined;
}) {
  const label = (name ?? "?").trim().charAt(0).toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ""}
        loading="eager"
        decoding="sync"
        fetchPriority="high"
        onError={brandFallbackOnError}
        className={`${className} shrink-0 rounded-lg bg-secondary object-cover`}
      />
    );
  }
  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-lg text-sm font-extrabold ${
        ACCENTS[accent ?? "primary"] ?? ACCENTS["primary"]
      }`}
    >
      {label}
    </span>
  );
}

function matchProducts(name: string, products: StoreProduct[]) {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 2);
  const scored = products
    .map((p) => {
      const hay = `${p.name} ${p.description ?? ""}`.toLowerCase();
      const score = words.reduce((s, w) => (hay.includes(w) ? s + 1 : s), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map((x) => x.p);
}

const ACCENTS: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  primary: "bg-primary/15 text-primary",
};

/* fixed scatter positions so every card lives in its own space */
const SPOTS = [
  "left-0 top-2",
  "right-0 top-16",
  "left-2 bottom-16",
  "right-2 bottom-0",
  "left-1/2 top-0 -translate-x-1/2",
  "left-1/2 bottom-1/2 -translate-x-1/2",
];

const ACCENT_CYCLE = ["emerald", "amber", "rose", "sky", "violet", "primary"];

export function HeroAnimation({
  items,
  products = [],
}: {
  items?: HeroItem[];
  products?: StoreProduct[];
}) {
  const t = useT();
  // Never show demo/placeholder names: use the configured hero items, and if
  // none exist fall back to the store's real products.
  const derived: HeroItem[] = products.slice(0, 6).map((p, i) => ({
    id: String(p.id),
    name: p.name,
    image_url: p.image_url ?? null,
    accent: ACCENT_CYCLE[i % ACCENT_CYCLE.length] ?? "primary",
  }));
  const cards = (items && items.length > 0 ? items : derived).slice(0, 6);

  const [active, setActive] = useState<HeroItem | null>(null);
  const matches = active ? matchProducts(active.name, products) : [];

  /* dynamic flow: product list → payment → delivery, looping product by product */
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const hasCards = cards.length > 0;
  const current: HeroItem | null = hasCards ? (cards[index] ?? cards[0] ?? null) : null;

  useEffect(() => {
    if (!hasCards) return;
    const delay = step === 0 ? 2600 : step === 1 ? 2200 : 2800;
    const t = setTimeout(() => {
      if (step < 2) setStep(step + 1);
      else {
        setStep(0);
        setIndex((i) => (i + 1) % cards.length);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [step, index, cards.length]);

  /* preload every logo once so they never flash while stepping through */
  useEffect(() => {
    cards.forEach((c) => {
      if (!c.image_url) return;
      const img = new Image();
      img.src = c.image_url;
    });
  }, [cards]);

  const startFlow = (i: number) => {
    setIndex(i);
    setStep(1);
  };



  return (
    <section className="relative">

      <div className="relative z-10 grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
        {/* left: copy */}
        <div className="w-full min-w-0 lg:col-span-7">
          <div className="eyebrow inline-flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
            {t("Instant digital delivery")}
          </div>
          <h1 className="display-xl mt-5 max-w-[14ch] text-balance sm:max-w-[16ch]">
            {t("Premium AI & streaming subscriptions")}
            <span className="mt-2 block text-[0.6em] font-bold leading-[1.1] text-muted-foreground">{t("— delivered to your inbox in seconds, from $0.03.")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("Order from our website or Telegram bot. Pay with Binance Pay or USDT. Receive your account, key or activation code automatically — no waiting.")}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" strokeWidth={1.75} /> {t("Auto delivery")}
            </span>
            <span aria-hidden className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" strokeWidth={1.75} /> {t("Crypto payment")}
            </span>
            <span aria-hidden className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" strokeWidth={1.75} /> {t("Telegram bot")}
            </span>
          </div>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-md px-6">
              <Link to="/store">
                <ShoppingBag className="h-4 w-4" strokeWidth={1.75} /> {t("Browse Products")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-md px-6">
              <a href="https://t.me/QORIX3_bot" target="_blank" rel="noreferrer">
                <Send className="h-4 w-4" strokeWidth={1.75} /> {t("Shop on Telegram")}
              </a>
            </Button>
            <Button asChild size="lg" variant="ghost" className="rounded-md px-4 underline-offset-4 hover:underline">
              <Link to="/track">
                <Search className="h-4 w-4" strokeWidth={1.75} /> {t("Track Order")}
              </Link>
            </Button>
          </div>
          <p className="mt-6 border-t hairline pt-4 font-mono text-xs tracking-wide text-muted-foreground">Binance Pay · USDT · bKash · Nagad</p>
        </div>

        {/* right: finished order-demo card — Order → Payment → Delivery (hidden until real products/items exist) */}
        {current && (
        <div className="relative mx-auto w-full min-w-0 max-w-md lg:col-span-5 lg:max-w-none">
          {/* layered backdrop so the column never reads as empty */}
          <span aria-hidden className="pointer-events-none absolute -bottom-3 -right-3 left-3 top-3 rounded-xl border hairline" />

          <div className="relative overflow-hidden rounded-xl border hairline bg-card shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]">
            {/* window header */}
            <div className="flex items-center justify-between border-b hairline px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
              </div>
              <span className="eyebrow">{t("How an order works")}</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> {t("Live demo")}
              </span>
            </div>

            <div className="p-5 sm:p-6">
              {/* step rail with checkmarks */}
              <ol className="relative mb-6 grid grid-cols-3 gap-2">
                <span className="absolute left-[16.67%] right-[16.67%] top-5 h-0.5 rounded-full bg-border" aria-hidden>
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-success transition-all duration-700"
                    style={{ width: step === 0 ? "0%" : step === 1 ? "50%" : "100%" }}
                  />
                </span>
                {[
                  { icon: ShoppingBag, label: t("Order") },
                  { icon: CreditCard, label: t("Payment") },
                  { icon: KeyRound, label: t("Delivery") },
                ].map((s, i) => {
                  const done = step > i || (step === 2 && i === 2);
                  const on = step === i;
                  return (
                    <li key={s.label} className="relative z-10 flex flex-col items-center gap-2 text-center">
                      <span
                        className={`grid h-10 w-10 place-items-center rounded-full border-2 transition-all duration-500 ${
                          done
                            ? "border-success bg-success text-success-foreground"
                            : on
                              ? "border-primary bg-primary/15 text-primary ring-4 ring-primary/15"
                              : "border-border bg-secondary text-muted-foreground"
                        }`}
                      >
                        {done ? <Check className="h-5 w-5" /> : <s.icon className="h-4 w-4" />}
                      </span>
                      <span className={`text-xs font-semibold ${done || on ? "text-foreground" : "text-muted-foreground"}`}>
                        {i + 1}. {s.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {/* stage — fixed height so the card never jumps */}
              <div className="min-h-[236px]">
                {step === 0 && (
                  <ul className="animate-fade-in space-y-2">
                    {cards.slice(0, 4).map((item, i) => (
                      <li key={`${item.name}-${i}`}>
                        <button
                          type="button"
                          onClick={() => startFlow(i)}
                          className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                            i === index ? "border-primary/60 bg-primary/10 shadow-md shadow-primary/10" : "border-border bg-secondary/40 hover:border-primary/40"
                          }`}
                        >
                          <Logo src={item.image_url} name={item.name} accent={item.accent} className="h-10 w-10" />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${i === index ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                            {i === index ? t("Selected") : "Buy"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {step === 1 && (
                  <div className="animate-fade-in space-y-3">
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3">
                      <Logo src={current.image_url} name={current.name} accent={current.accent} className="h-11 w-11" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{current.name}</p>
                        <p className="text-[11px] text-muted-foreground">{t("Added to order")}</p>
                      </div>
                      <Check className="h-5 w-5 shrink-0 text-success" />
                    </div>
                    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <CreditCard className="h-4 w-4 text-primary" /> Binance Pay / USDT
                      </p>
                      <div className="relative mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <span className="hero-beam absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary" />
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{t("Verifying payment…")}</p>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="animate-fade-in space-y-3">
                    <div className="rounded-2xl border border-success/40 bg-success/10 p-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success text-success-foreground shadow-lg shadow-success/30">
                          <Check className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-success">{t("Order delivered")}</p>
                          <p className="truncate text-xs text-muted-foreground">{current.name}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">
                        <KeyRound className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">{t("Your access details are ready")}</span>
                      </div>
                      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5" /> {t("Sent to your inbox & Telegram")}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="w-full min-w-0 rounded-full" onClick={() => setActive(current)}>
                      <Globe className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">See {current.name} plans</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Logo src={active?.image_url} name={active?.name} accent={active?.accent} className="h-8 w-8" />
              {active?.name}
            </DialogTitle>
            <DialogDescription>
              {matches.length > 0
                ? t("Pick a plan below — instant delivery after payment.")
                : t("No exact match yet. Browse the full catalogue for similar products.")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {matches.map((p) => (
              <Link
                key={p.id}
                to="/store/$id"
                params={{ id: (p as any).slug ?? p.id }}
                search={{ buy: false }}
                onClick={() => setActive(null)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors hover:border-primary/60"
              >
                <Logo src={p.image_url} name={p.name} className="h-11 w-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.delivery_time ? t(p.delivery_time) : t("Instant delivery")}
                  </span>
                </span>
                <span className="text-sm font-bold text-primary">{priceTag(p.price)}</span>
              </Link>
            ))}
          </div>

          <Button asChild className="w-full rounded-full">
            <Link to="/store" search={active ? { q: active.name } : {}} onClick={() => setActive(null)}>
              <ShoppingBag className="h-4 w-4" /> View in store
            </Link>
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
