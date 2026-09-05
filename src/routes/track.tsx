import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { trackWebsiteOrder } from "@/lib/shop.functions";
import { StoreShell, priceTag } from "@/components/StoreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { productionUrlFor } from "@/lib/site-url";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track your order — QORIX Store" },
      { name: "description", content: "Enter your order number and email to check status and view your delivered digital product." },
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
  const track = useServerFn(trackWebsiteOrder);
  const [orderNo, setOrderNo] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<any>(null);

  // Pre-fill from email link (?order=...&email=...).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const o = p.get("order");
    const e = p.get("email");
    if (o) setOrderNo(o);
    if (e) setEmail(decodeURIComponent(e));
  }, []);

  const mut = useMutation({
    mutationFn: () => track({ data: { order_no: orderNo, email } }),
    onSuccess: (r) => setOrder(r),
    onError: (e: Error) => {
      setOrder(null);
      toast.error(e.message);
    },
  });

  return (
    <StoreShell>
      <section className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">{t("Track your order")}</h1>
        <Card className="mt-6 bg-card/70">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1">
              <Label>{t("Order number")}</Label>
              <Input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="e.g. 1042" />
            </div>
            <div className="space-y-1">
              <Label>{t("Email used at checkout")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => mut.mutate()} disabled={!orderNo || !email || mut.isPending}>
              {t("Check status")}
            </Button>
          </CardContent>
        </Card>

        {order && (
          <Card className="mt-4 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t("Order")} #{order.order_no}</span>
                <Badge variant={order.status === "completed" ? "default" : "secondary"}>{order.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {order.quantity}× {order.product_name} — {priceTag(order.total)}
              </p>
              {order.delivered_content ? (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{order.delivered_content}</pre>
              ) : (
                <p className="text-muted-foreground">{t("Payment is being verified. Your delivery will appear here.")}</p>
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </StoreShell>
  );
}
