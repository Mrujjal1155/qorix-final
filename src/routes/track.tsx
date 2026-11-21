import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { searchTrackingOrders } from "@/lib/shop.functions";
import { StoreShell, priceTag } from "@/components/StoreShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { productionUrlFor } from "@/lib/site-url";
import { useT } from "@/lib/i18n";
import { BotFrame, useMobileTemplate } from "@/components/mobile/BotFrame";
import { Bubble, Key, Keys, Title } from "@/components/mobile/BotStorefront";
import { ArrowLeft, Search, Package, LockKeyhole } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import type { TrackingResult } from "@/lib/order-tracking";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track your order — QORIX Store" },
      { name: "description", content: "Track your QORIX order using an order ID or email. Delivery details stay protected." },
      { property: "og:title", content: "Track your order — QORIX Store" },
      { property: "og:description", content: "Check order status and retrieve your delivery details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: productionUrlFor("/track") },
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/track") }],
  }),
  component: TrackPage,
});

function TrackPage() {
  const t = useT();
  const mobile = useMobileTemplate();
  const router = useRouter();
  const track = useServerFn(searchTrackingOrders);
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<TrackingResult[] | null>(null);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  // Pre-fill from email link (?order=...&email=...).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const o = p.get("order");
    const e = p.get("email");
    if (o || e) setQuery(o || e || "");
    const tk = p.get("t");
    if (tk) setToken(tk);
  }, []);

  const mut = useMutation({
    mutationFn: () => track({ data: { query, token } }),
    onSuccess: (r) => { setOrders(r); setError(""); },
    onError: (e: Error) => {
      setOrders(null); setError(e.message);
      toast.error(e.message);
    },
  });

  const results = <>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {orders?.length === 0 && <p role="status" className="text-sm">No orders found.</p>}
    {orders?.map(order => <div key={order.order_no} className="space-y-3 border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 font-bold"><Package className="h-4 w-4 shrink-0" />#{order.order_no} · {order.order_code}</p><Badge variant={order.status === "completed" ? "default" : "secondary"}>{order.status}</Badge></div>
      {order.product_name && <p className="break-words text-sm">{order.quantity}× {order.product_name} — {priceTag(order.total)}</p>}
      {order.delivered_content ? <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">{order.delivered_content}</pre>
        : order.locked ? <p className="flex items-start gap-2 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />Sign in to the purchasing account or open your secure order link to view private details and delivery.</p>
        : <p className="text-sm text-muted-foreground">{order.status === "completed" ? "Delivery is being prepared." : "Your order is being processed."}</p>}
    </div>)}
  </>;
  const field = <div className="space-y-2"><Label htmlFor="tracking-query">Order ID or email</Label><Input id="tracking-query" value={query} maxLength={160} onChange={e => { setQuery(e.target.value); setOrders(null); setError(""); }} placeholder="1042 / ORD-9992082D / email@example.com" autoComplete="off" className="w-full" /></div>;
  const home = () => { void router.navigate({ to: "/" }); };
  if (mobile) return <BotFrame onBack={home} onMenu={home}>
    <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); if (query.trim() && !mut.isPending) mut.mutate(); }}>
      <Bubble><Title>TRACK ORDER</Title><div className="mt-4">{field}</div></Bubble>
      <Button type="submit" disabled={!query.trim() || mut.isPending} className="min-h-12 w-full bg-tg-btn text-tg-btn-fg hover:bg-tg-btn/90"><Search className="h-4 w-4" />{mut.isPending ? "Checking…" : "Check status"}</Button>
    </form>
    {(orders || error) && <Bubble>{results}</Bubble>}
    <Keys cols={1}><Key tone="red" icon={ArrowLeft} onClick={home}>Main Menu</Key></Keys>
  </BotFrame>;

  return (
    <StoreShell>
      <section className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">{t("Track your order")}</h1>
        <Card className="mt-6 bg-card/70">
          <CardContent className="space-y-4 pt-6">
            {field}
            <Button className="w-full" onClick={() => mut.mutate()} disabled={!query.trim() || mut.isPending}>
              {t("Check status")}
            </Button>
          </CardContent>
        </Card>

        {(orders || error) && <Card className="mt-4"><CardContent className="pt-4">{results}</CardContent></Card>}
      </section>
    </StoreShell>
  );
}
