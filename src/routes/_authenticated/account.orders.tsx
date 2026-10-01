import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CalendarDays, ChevronDown, CircleCheck, Clock3, Copy, CreditCard, PackageCheck, Zap } from "lucide-react";
import { getMyAccount } from "@/lib/account.functions";
import { AccountShell, statusTone } from "@/components/AccountShell";
import { priceTag } from "@/components/StoreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account/orders")({
  head: () => ({
    meta: [
      { title: "My orders — QORIX Store" },
      { name: "description", content: "Every order you placed on QORIX Store with live status and delivered product details." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "My orders — QORIX Store" },
      { property: "og:description", content: "Order history and deliveries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyOrders,
});

function OrderCard({ order }: { order: any }) {
  const [showDelivery, setShowDelivery] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  const delivered = Boolean(order.delivered_content);
  const manual = order.delivery_type !== "auto";

  return (
    <Card className="group overflow-hidden bg-card/70 transition-colors duration-200 hover:border-primary/40">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b border-border/50 bg-secondary/20">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="font-mono text-sm text-muted-foreground">#{o_no(order)}</span>
          <span>{order.product_name}</span>
          <span className="text-sm font-normal text-muted-foreground">× {order.quantity}</span>
        </CardTitle>
        <span className={`text-xs font-semibold uppercase tracking-wide ${statusTone(order.status)}`}>
          {order.status}
        </span>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CircleCheck className="h-3.5 w-3.5" /> {priceTag(order.total)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> {new Date(order.created_at).toLocaleString()}
          </span>
          {order.payment_method && (
            <span className="inline-flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> {order.payment_method}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            {manual ? <Clock3 className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
            {manual ? "Manual delivery" : "Instant delivery"}
          </span>
        </div>

        {delivered ? (
          <div className="rounded-xl border border-border/60 bg-secondary/30">
            <button
              type="button"
              onClick={() => setShowDelivery((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2.5">
                <PackageCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Delivery details</span>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  {showDelivery ? "Hide" : "Tap to view"}
                </Badge>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${showDelivery ? "rotate-180" : ""}`} />
            </button>
            {showDelivery && (
              <div className="border-t border-border/60 px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Your delivery
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => copy(order.delivered_content)}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
                  {order.delivered_content}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border/70 bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
            Waiting for confirmation — your product will show up here once the payment is verified.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function o_no(order: any) {
  return order.order_no;
}

function MyOrders() {
  const fetchAccount = useServerFn(getMyAccount);
  const { data, isLoading } = useQuery({ queryKey: ["my-account"], queryFn: () => fetchAccount() });
  const orders = data?.orders ?? [];

  return (
    <AccountShell title="My orders" subtitle="Delivered products appear here as soon as an order is completed.">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <Card className="bg-card/70">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You have no orders yet.{" "}
            <Link to="/store" className="text-primary">
              Start shopping
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((o: any) => (
            <OrderCard key={o.order_no} order={o} />
          ))}
        </div>
      )}
    </AccountShell>
  );
}
