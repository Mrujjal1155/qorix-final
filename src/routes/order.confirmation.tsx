import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Wallet } from "lucide-react";
import { getOrderConfirmation } from "@/lib/shop.functions";
import { StoreShell } from "@/components/StoreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePrefs } from "@/lib/prefs";
import { toast } from "sonner";

export const Route = createFileRoute("/order/confirmation")({
  validateSearch: (search: Record<string, unknown>): { order: string; email: string } => ({
    order: search["order"] ? String(search["order"]) : "",
    email: search["email"] ? String(search["email"]) : "",
  }),
  head: () => ({
    meta: [
      { title: "Order confirmation — QORIX Store" },
      { name: "description", content: "Your order summary with product details, converted total, payment reference and wallet balance." },
      { property: "og:title", content: "Order confirmation — QORIX Store" },
      { property: "og:description", content: "Order summary, total amount and wallet update." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationPage,
});

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function ConfirmationPage() {
  const { order: orderNo, email } = Route.useSearch();
  const fetchOrder = useServerFn(getOrderConfirmation);
  const { money, usd, currency, rate } = usePrefs();

  const { data, isLoading, error } = useQuery({
    queryKey: ["order-confirmation", orderNo, email],
    queryFn: () => fetchOrder({ data: { order_no: orderNo, email } }),
    enabled: Boolean(orderNo && email),
    retry: false,
  });

  const o = data?.order as any;
  const wallet = data?.wallet as any;

  return (
    <StoreShell>
      <section className="mx-auto max-w-2xl px-4 py-12">
        {!orderNo || !email ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Missing order details.{" "}
              <Link to="/track" className="text-primary">
                Track your order
              </Link>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Loading your order…</p>
        ) : error || !o ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              We could not find this order. Please use the tracking page.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h1 className="mt-4 text-3xl font-semibold">Order #{o.order_no} confirmed</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                A receipt was emailed to <strong>{email}</strong>. Delivery appears here and on the tracking page once the
                payment is verified.
              </p>
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Order details</CardTitle>
                <Badge variant="secondary" className="uppercase">
                  {o.status}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0">
                <Row label="Product" value={o.product_name} />
                <Row label="Quantity" value={o.quantity} />
                <Row label="Unit price" value={`${money(o.unit_price)} · ${usd(o.unit_price)}`} />
                {Number(o.discount) > 0 && <Row label="Discount" value={`− ${money(o.discount)}`} />}
                <Row label="Delivery" value={o.delivery_type === "auto" ? "Instant delivery" : "Manual delivery"} />
                <Row label="Payment method" value={o.payment_method ?? "—"} />
                <Row
                  label="Transaction ID"
                  value={
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-primary"
                      onClick={() => {
                        void navigator.clipboard.writeText(String(o.txid ?? ""));
                        toast.success("Copied");
                      }}
                    >
                      <span className="max-w-[180px] truncate">{o.txid ?? "—"}</span>
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  }
                />
                <Row label="Placed" value={new Date(o.created_at).toLocaleString()} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Amount &amp; currency</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Row label="Display currency" value={currency} />
                <Row label="Conversion rate" value={`1 USD = ${Number(rate).toLocaleString()} ${currency}`} />
                <Row
                  label="Total paid"
                  value={<span className="text-lg font-semibold text-primary">{money(o.total)}</span>}
                />
                <Row label="Total in USD" value={usd(o.total)} />
              </CardContent>
            </Card>

            {wallet && (
              <Card>
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <Wallet className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Wallet update</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Row label="Wallet balance" value={`${money(wallet.balance)} · ${usd(wallet.balance)}`} />
                  <Row label="Referral earnings" value={`${money(wallet.earnings)} · ${usd(wallet.earnings)}`} />
                  {wallet.recent?.length ? (
                    <div className="mt-3 space-y-2">
                      {wallet.recent.map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                          <span className="capitalize text-muted-foreground">{t.note || t.type}</span>
                          <span className={Number(t.amount) >= 0 ? "text-primary" : "text-destructive"}>
                            {Number(t.amount) >= 0 ? "+" : "−"}
                            {money(Math.abs(Number(t.amount)))}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Referral commission is added to the wallet once this order is completed.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-center gap-3">
              <Button asChild>
                <Link to="/track" search={{ }}>
                  Track my order
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/store">Keep shopping</Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </StoreShell>
  );
}
