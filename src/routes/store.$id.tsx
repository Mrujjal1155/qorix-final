import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { plainRich } from "@/lib/bot/richtext";

import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  Headphones,
  Link2 as LinkIcon,
  MessageCircle,
  Minus,
  Plus,
  Send,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Zap,
} from "lucide-react";

import { getStoreProduct, getStorePayInfo } from "@/lib/shop.functions";
import { SmartImage } from "@/components/SmartImage";
import { useT } from "@/lib/i18n";
import { StoreShell } from "@/components/StoreShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePrefs } from "@/lib/prefs";
import { productionUrlFor } from "@/lib/site-url";



export const Route = createFileRoute("/store/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Product — QORIX Store" },
      {
        name: "description",
        content: "Review the product, pay with Binance Pay or USDT and submit your transaction ID to complete the order.",
      },
      { property: "og:title", content: "Product — QORIX Store" },
      { property: "og:description", content: "Secure crypto checkout for premium digital products." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: productionUrlFor(`/store/${params.id}`) },
    ],
    links: [{ rel: "canonical", href: productionUrlFor(`/store/${params.id}`) }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    buy: search["buy"] === true || search["buy"] === "true" || search["buy"] === "1",
  }),
  component: ProductPage,
});

function ProductPage() {
  const t = useT();
  const { id } = Route.useParams();
  const { buy } = Route.useSearch();
  const navigate = useNavigate();
  const fetchProduct = useServerFn(getStoreProduct);
  const fetchPay = useServerFn(getStorePayInfo);


  const { data: product } = useQuery({
    queryKey: ["store-product", id],
    queryFn: () => fetchProduct({ data: { id } }),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  const { data: pay } = useQuery({ queryKey: ["store-pay"], queryFn: () => fetchPay() });

  const [qty, setQty] = useState(1);
  const { money, usd, currency } = usePrefs();

  const total = Number(product?.price ?? 0) * qty;
  const stock = Number((product as any)?.stock ?? 0);
  const auto = product?.delivery_type === "auto";
  const oldPrice = Number(product?.old_price ?? 0);
  const off = oldPrice > Number(product?.price ?? 0) ? Math.round(((oldPrice - Number(product?.price)) / oldPrice) * 100) : 0;
  const sold = Number((product as any)?.sold ?? 0);
  const inStock = auto ? stock > 0 : true;
  const claimed = stock + sold > 0 ? Math.round((sold / (stock + sold)) * 100) : 0;
  const botUser = pay?.["bot_username"] ?? "";
  const supportContact = (pay?.["support_contact"] ?? "").replace(/^@/, "");

  const startCheckout = () => void navigate({ to: "/checkout", search: { id, qty, step: "details" } });

  useEffect(() => {
    if (buy) startCheckout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buy]);

  function copy(v: string) {
    navigator.clipboard.writeText(v);
    toast.success("Copied");
  }


  return (
    <StoreShell>
      <section className="mx-auto max-w-6xl px-4 py-8">
        <Link
          to="/store"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Products
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {/* Gallery */}
          <div>
            <div className="relative overflow-hidden rounded-2xl border border-border bg-secondary/40">
              <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex items-start justify-between">
                <div className="flex flex-col gap-2">
                  {off > 0 && (
                    <span className="w-fit rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground shadow">
                      -{off}% OFF
                    </span>
                  )}
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${
                      inStock ? "bg-success/90 text-background" : "bg-destructive text-destructive-foreground"
                    }`}
                  >
                    {inStock ? "In Stock" : "Out of Stock"}
                  </span>
                </div>
                {product?.badge && (
                  <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur">
                    {product.badge}
                  </span>
                )}
              </div>
              <SmartImage
                src={product?.image_url}
                alt={product?.name ?? ""}
                priority
                sizes="(max-width: 1024px) 100vw, 600px"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Share2 className="h-4 w-4" /> Share:
              </span>
              <button
                type="button"
                onClick={() => copy(typeof window !== "undefined" ? window.location.href : "")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <LinkIcon className="h-3.5 w-3.5" /> Copy link
              </button>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <Send className="h-3.5 w-3.5" /> Telegram
              </a>
            </div>
          </div>

          {/* Info */}
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight">{product?.name ?? "Loading…"}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                ))}
                <span className="ml-1 font-semibold text-foreground">5.0</span>
              </span>
              {sold > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs">
                  <Eye className="h-3.5 w-3.5" /> {sold}+ sold so far
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              {oldPrice ? <span className="text-lg text-muted-foreground line-through">{money(oldPrice)}</span> : null}
              {oldPrice > Number(product?.price ?? 0) && (
                <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
                  Save {money(oldPrice - Number(product?.price ?? 0))}
                </span>
              )}
            </div>

            {plainRich(product?.description) && (
              <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed text-muted-foreground">
                <p className="whitespace-pre-wrap">{plainRich(product?.description)}</p>
              </div>
            )}


            {product?.delivery_time ? (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3.5 py-1.5 text-sm font-semibold text-success">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                {product.delivery_time}
              </div>
            ) : null}

            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {[
                product?.badge || "Premium Features",
                "Full Access",
                auto ? "Automatic Delivery" : "Manual Delivery",

              ].map((f) => (
                <span key={f} className="inline-flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> <span className="text-foreground">{f}</span>
                </span>
              ))}
            </div>

            {/* Stock meter */}
            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 text-success">
                  <span className="h-2 w-2 rounded-full bg-success" /> Available: {stock} units
                </span>
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" /> Sold: {sold} units
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Total Stock: {stock + sold} units
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-success transition-all"
                  style={{ width: `${claimed}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{claimed}% claimed</span>
                <span className={inStock ? "text-success" : "text-destructive"}>
                  {inStock ? t("In stock") : t("Out of stock")}
                </span>
              </div>
            </div>

            {/* Quantity + price */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold">Quantity:</span>
              <div className="inline-flex items-center rounded-xl border border-border">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  className="px-3 py-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center font-semibold">{qty}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  className="px-3 py-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setQty((q) => Math.min(20, q + 1))}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">Total Price</p>
            <p className="text-3xl font-extrabold text-primary">{money(total)}</p>
            {currency !== "USD" ? (
              <p className="text-xs text-muted-foreground">≈ {usd(total)} USD</p>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button variant="secondary" size="lg" className="rounded-xl" onClick={startCheckout}>
                <ShoppingCart className="h-4 w-4" /> Add to Cart
              </Button>
              <Button size="lg" className="rounded-xl" onClick={startCheckout}>
                <Zap className="h-4 w-4" /> {t("Buy Now")}
              </Button>
            </div>

            <p className="mt-4 text-center">
              <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
                ⭐ Recommended
              </span>
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline" size="lg" className="rounded-xl border-success/50 text-success">
                <a href={`https://t.me/${supportContact || "vibexAcademybd"}`} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" /> Order on Support
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl border-primary/50 text-primary">
                <a href={`https://t.me/${botUser || "QORIX3_bot"}?start=p_${id}`} target="_blank" rel="noreferrer">
                  <Send className="h-4 w-4" /> Order on Telegram
                </a>
              </Button>
            </div>


            <p className="mt-5 text-xs font-semibold">We Accept:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {["Binance Pay", "USDT BEP-20", "USDT TRC-20", "Bitcoin", "Bank Transfer"].map((m) => (
                <span key={m} className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-semibold">
                  {m}
                </span>
              ))}
            </div>

            <div className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-4 text-xs">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  <span className="font-semibold text-foreground">Check before purchase</span>
                  <br />
                  Review the subscription details, terms and refund policy before placing an order.
                </p>
              </div>
              <div className="flex gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  <span className="font-semibold text-foreground">Delivery</span>
                  <br />
                  {auto
                    ? "Automatic delivery right after your payment is verified."
                    : "Manual delivery by our team, usually within a few hours."}
                </p>
              </div>
              <div className="flex gap-2">
                <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  <span className="font-semibold text-foreground">Customer support</span>
                  <br />
                  Message us on Telegram any time — we reply 24/7.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 text-success">
                <ShieldCheck className="h-3.5 w-3.5" /> Warranty included
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> {auto ? "Instant" : "Fast"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> 100% Genuine
              </span>
            </div>
          </div>
        </div>

        {Array.isArray((product as any)?.details) && ((product as any).details as any[]).length > 0 && (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold">Product details</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {((product as any).details as { label: string; value: string }[]).map((d, i) => (
                <div key={`${d.label}-${i}`}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {plainRich(d.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {(product?.important_note || product?.quick_guide) && (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {product?.important_note && (
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-bold">Important</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {plainRich(product.important_note)}
                </p>
              </div>
            )}
            {product?.quick_guide && (
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-bold">Quick Guide</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {plainRich(product.quick_guide)}
                </p>
              </div>
            )}
          </div>
        )}





      </section>
    </StoreShell>
  );
}
