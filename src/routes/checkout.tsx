import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bitcoin,
  CheckCircle2,
  Coins,
  Copy,
  CreditCard,
  Send,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";

import { getStoreProduct, getStorePayInfo, placeWebsiteOrder } from "@/lib/shop.functions";
import { getEpsStatus, startEpsCheckout } from "@/lib/eps.functions";
import { StoreShell, priceTag } from "@/components/StoreShell";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePrefs } from "@/lib/prefs";
import { productionUrlFor } from "@/lib/site-url";

const STEPS = ["details", "pay", "confirm"] as const;
type Step = (typeof STEPS)[number];

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — QORIX Store" },
      {
        name: "description",
        content: "Step-by-step secure checkout: enter your details, pay with Binance Pay or USDT, then confirm your order.",
      },
      { property: "og:title", content: "Checkout — QORIX Store" },
      { property: "og:description", content: "Step-by-step secure crypto checkout for premium digital products." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/checkout") }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    id: String(search["id"] ?? ""),
    qty: Math.max(1, Math.min(20, Math.floor(Number(search["qty"] ?? 1) || 1))),
    step: (STEPS.includes(search["step"] as Step) ? (search["step"] as Step) : "details") as Step,
  }),
  component: CheckoutPage,
});

const METHODS = [
  { id: "binance", label: "Binance Pay", key: "binance_pay_id", icon: CreditCard, hint: "Pay ID transfer" },
  { id: "usdt_bep20", label: "USDT · BEP-20", key: "usdt_bep20_address", icon: Coins, hint: "BNB Smart Chain" },
  { id: "usdt_trc20", label: "USDT · TRC-20", key: "usdt_trc20_address", icon: Bitcoin, hint: "Tron network" },
] as const;

const EPS_METHOD = {
  id: "eps",
  label: "bKash · Nagad · Rocket · Card",
  icon: Smartphone,
  hint: "Instant — EPS secure gateway",
} as const;

function CheckoutPage() {
  const { id, qty, step } = Route.useSearch();
  const navigate = useNavigate();
  const fetchProduct = useServerFn(getStoreProduct);
  const fetchPay = useServerFn(getStorePayInfo);
  const submit = useServerFn(placeWebsiteOrder);
  const fetchEps = useServerFn(getEpsStatus);
  const startEps = useServerFn(startEpsCheckout);
  const { money, usd, currency } = usePrefs();

  const { data: product } = useQuery({
    queryKey: ["store-product", id],
    queryFn: () => fetchProduct({ data: { id } }),
    enabled: !!id,
  });
  const { data: pay } = useQuery({ queryKey: ["store-pay"], queryFn: () => fetchPay() });
  const { data: eps } = useQuery({ queryKey: ["eps-status"], queryFn: () => fetchEps() });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<string>("binance");
  const [txid, setTxid] = useState("");

  const total = Number(product?.price ?? 0) * qty;
  const isEps = method === "eps";
  const cryptoMethod = METHODS.find((m) => m.id === method);
  const address = cryptoMethod ? (pay?.[cryptoMethod.key] ?? "") : "";
  const botUser = pay?.["bot_username"] ?? "";
  const epsTotalBdt = Math.round(total * Number(eps?.rate ?? 0) * 100) / 100;

  const go = (next: Step) => void navigate({ to: "/checkout", search: { id, qty, step: next } });

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const mut = useMutation({
    mutationFn: () =>
      submit({
        data: { product_id: id, quantity: qty, customer_name: name, customer_email: email, payment_method: method, txid },
      }),
    onSuccess: (r) => {
      toast.success(`Order #${r.order_no} placed`);
      void navigate({ to: "/order/confirmation", search: { order: String(r.order_no), email } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copy(v: string) {
    navigator.clipboard.writeText(v);
    toast.success("Copied");
  }

  if (!id) {
    return (
      <StoreShell>
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Nothing to check out</h1>
          <p className="mt-2 text-sm text-muted-foreground">Pick a product first, then continue to checkout.</p>
          <Button asChild className="mt-6 rounded-xl">
            <Link to="/store">Browse products</Link>
          </Button>
        </section>
      </StoreShell>
    );
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <StoreShell>
      <section className="mx-auto max-w-3xl px-4 py-8">
        <Link
          to="/store/$id"
          params={{ id }}
          search={{ buy: false }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to product
        </Link>

        <Card className="mt-6 overflow-hidden glass-panel">
          <CardHeader className="border-b border-border/60 bg-primary/5">
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" /> Secure Crypto Checkout
              </span>
              <span className="text-primary">{priceTag(total)}</span>
            </CardTitle>
            <div className="mt-4 flex items-center gap-2">
              {["Details", "Pay", "Confirm"].map((s, i) => {
                const active = stepIndex >= i;
                return (
                  <div key={s} className="flex flex-1 items-center gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
                    {i < 2 && <span className={`h-px flex-1 ${stepIndex > i ? "bg-primary" : "bg-border"}`} />}
                  </div>
                );
              })}
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {/* Order summary — visible on every step */}
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              {product?.image_url ? (
                <img src={product.image_url} alt={product.name} className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary text-primary">
                  <CategoryIcon name={product?.name} className="h-7 w-7" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{product?.name ?? "Loading…"}</p>
                <p className="text-xs text-muted-foreground">
                  Quantity: {qty} · {product?.delivery_type === "auto" ? "Automatic delivery" : "Manual delivery"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-extrabold text-primary">{money(total)}</p>
                {currency !== "USD" ? <p className="text-[11px] text-muted-foreground">≈ {usd(total)} USD</p> : null}
              </div>
            </div>

            {step === "details" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Your name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
                </div>
                <div className="space-y-1">
                  <Label>Email (delivery + tracking)</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.com" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Payment method</Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {METHODS.map((m) => {
                      const on = method === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMethod(m.id)}
                          className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 ${
                            on ? "border-primary bg-primary/10 card-glow" : "border-border bg-card"
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                              on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <m.icon className="h-4 w-4" />
                          </span>
                          <p className="mt-3 text-sm font-semibold">{m.label}</p>
                          <p className="text-xs text-muted-foreground">{m.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button className="md:col-span-2" disabled={!name.trim() || !email.trim()} onClick={() => go("pay")}>
                  Continue to payment <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {step === "pay" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Exact amount</p>
                  <button
                    className="mt-1 inline-flex items-center gap-2 text-3xl font-extrabold text-primary"
                    onClick={() => copy(total.toFixed(2))}
                  >
                    {total.toFixed(2)} USDT <Copy className="h-4 w-4" />
                  </button>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Send to · {METHODS.find((m) => m.id === method)!.label}
                  </p>
                  <button
                    className="mt-2 block w-full break-all rounded-xl bg-muted/60 p-3 text-left font-mono text-xs hover:bg-muted"
                    onClick={() => address && copy(address)}
                  >
                    {address || "Not configured yet — contact support"}
                  </button>
                  <p className="mt-2 text-xs text-muted-foreground">Tap to copy. Send the exact amount, then continue.</p>
                </div>
                {botUser ? (
                  <Button asChild variant="outline" className="w-full rounded-xl border-primary/50 text-primary">
                    <a href={`https://t.me/${botUser}?start=p_${id}`} target="_blank" rel="noreferrer">
                      <Send className="h-4 w-4" /> Pay inside our Telegram bot instead
                    </a>
                  </Button>
                ) : null}
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => go("details")}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button className="flex-1" onClick={() => go("confirm")}>
                    I have paid <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === "confirm" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Transaction ID</Label>
                  <Input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="Paste TXID / Binance order id" />
                  <p className="text-xs text-muted-foreground">
                    We verify the transaction automatically and deliver to {email || "your email"}.
                  </p>
                </div>
                <ul className="space-y-1.5 rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                  <li className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Receipt goes to {email || "your email"}
                  </li>
                  <li className="inline-flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Track your order any time from the tracking page
                  </li>
                </ul>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => go("pay")}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!product || !name.trim() || !email.trim() || !txid.trim() || mut.isPending}
                    onClick={() => mut.mutate()}
                  >
                    {mut.isPending ? "Placing order…" : `Place order · ${priceTag(total)}`}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </StoreShell>
  );
}
