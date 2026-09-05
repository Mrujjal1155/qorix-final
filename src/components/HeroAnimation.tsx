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
import {
  Bot,
  CreditCard,
  Globe,
  KeyRound,
  MessageCircle,
  Search,
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
    <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-background to-secondary/40 p-6 sm:p-10">
      <span className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-[80px]" />
      <span className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-success/10 blur-[80px]" />

      <div className="relative z-10 grid items-center gap-10 lg:grid-cols-2">
        {/* left: copy */}
        <div className="w-full min-w-0 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" />
            {t("Instant digital delivery")}
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            {t("Buy AI tools & subscriptions.")}
            <span className="block text-primary">{t("Delivered in seconds.")}</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("Order from our website or Telegram bot. Pay with Binance Pay or USDT. Receive your account, key or activation code automatically — no waiting.")}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-medium">
            <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5 text-success">
              <KeyRound className="h-4 w-4" /> {t("Auto delivery")}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-primary">
              <CreditCard className="h-4 w-4" /> {t("Crypto payment")}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-secondary-foreground">
              <Bot className="h-4 w-4" /> {t("Telegram bot")}
            </span>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-full px-7 shadow-lg shadow-primary/30">
              <Link to="/store">
                <ShoppingBag className="h-4 w-4" /> {t("Browse Products")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7 glass-panel">
              <Link to="/track">
                <Search className="h-4 w-4" /> {t("Track Order")}
              </Link>
            </Button>
          </div>
        </div>

        {/* right: serial product board → payment → delivery (hidden until real products/items exist) */}
        {current && (
        <div className="relative mx-auto w-full min-w-0 max-w-md">
          <div className="rounded-3xl border border-border/70 bg-card/80 p-4 shadow-xl backdrop-blur">
            {/* step rail */}
            <div className="mb-4 flex w-full min-w-0 items-center gap-1.5 sm:gap-2">
              {[
                { icon: ShoppingBag, label: t("Order") },
                { icon: CreditCard, label: t("Payment") },
                { icon: KeyRound, label: t("Delivery") },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className={`flex min-w-0 items-center gap-1.5 sm:gap-2 ${i < 2 ? "flex-1" : "shrink-0"}`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors duration-500 ${
                      step >= i
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary text-muted-foreground"
                    }`}
                  >
                    <s.icon className="h-4 w-4" />
                  </span>
                  <span
                    className={`min-w-0 truncate text-[11px] font-semibold transition-colors duration-500 ${
                      step >= i ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                  {i < 2 && (
                    <span className="relative ml-auto h-1 w-4 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={`absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-700 ${
                          step > i ? "w-full" : "w-0"
                        }`}
                      />
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* step 0 — serial product list */}
            {step === 0 && (
              <ul className="animate-fade-in space-y-2">
                {cards.map((item, i) => (
                  <li key={item.id ?? item.name}>
                    <button
                      type="button"
                      onClick={() => startFlow(i)}
                      aria-label={`Order ${item.name}`}
                      className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all hover:border-primary/60 hover:bg-secondary/60 ${
                        i === index ? "border-primary bg-secondary/70 shadow-md" : "border-border bg-card"
                      }`}
                    >
                      <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <Logo src={item.image_url} name={item.name} accent={item.accent} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        Buy
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* step 1 — payment */}
            {step === 1 && (
              <div className="animate-fade-in space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 p-2.5">
                  <Logo src={current.image_url} name={current.name} accent={current.accent} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{current.name}</span>
                  <span className="text-xs font-bold text-primary">{t("Checkout")}</span>
                </div>
                <div className="rounded-2xl border border-border p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <CreditCard className="h-4 w-4 text-primary" /> Binance Pay / USDT
                  </p>
                  <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <span className="hero-beam absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary" />
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">{t("Verifying transaction on-chain…")}</p>
                </div>
              </div>
            )}

            {/* step 2 — delivery */}
            {step === 2 && (
              <div className="animate-fade-in space-y-3">
                <div className="flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/20 text-success">
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{t("Payment confirmed")}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{current.name} — delivering now</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{t("Order delivered")}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Your {current.name} access is in your inbox & Telegram
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full min-w-0 rounded-full"
                  onClick={() => setActive(current)}
                >
                  <Globe className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">See {current.name} plans</span>
                </Button>
              </div>
            )}
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
                params={{ id: p.id }}
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
