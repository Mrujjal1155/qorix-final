import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy } from "lucide-react";
import { getMyAccount } from "@/lib/account.functions";
import { AccountShell, statusTone } from "@/components/AccountShell";
import { priceTag } from "@/components/StoreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

function MyOrders() {
  const fetchAccount = useServerFn(getMyAccount);
  const { data, isLoading } = useQuery({ queryKey: ["my-account"], queryFn: () => fetchAccount() });
  const orders = data?.orders ?? [];

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

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
            <Card key={o.order_no} className="bg-card/70">
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">
                  #{o.order_no} · {o.quantity}× {o.product_name}
                </CardTitle>
                <span className={`text-xs font-semibold uppercase ${statusTone(o.status)}`}>{o.status}</span>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-4 text-muted-foreground">
                  <span>Total {priceTag(o.total)}</span>
                  <span>{new Date(o.created_at).toLocaleString()}</span>
                  {o.payment_method && <span>via {o.payment_method}</span>}
                  <span>{o.delivery_type === "auto" ? "Instant delivery" : "Manual delivery"}</span>
                </div>
                {o.delivered_content ? (
                  <div className="rounded-xl border border-border/70 bg-secondary/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Your delivery
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => copy(o.delivered_content)}>
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                      </Button>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{o.delivered_content}</pre>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Waiting for confirmation — your product will show up here once the payment is verified.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AccountShell>
  );
}
