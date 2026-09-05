import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { ArrowRight, CheckCircle2, Clock, Package, Wallet } from "lucide-react";
import { getMyAccount, linkMyOrders } from "@/lib/account.functions";
import { AccountShell, statusTone } from "@/components/AccountShell";
import { priceTag } from "@/components/StoreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({
    meta: [
      { title: "My account — QORIX Store" },
      { name: "description", content: "See your QORIX Store orders, spending and delivered digital products in one place." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "My account — QORIX Store" },
      { property: "og:description", content: "Your orders, spending and deliveries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountOverview,
});

function AccountOverview() {
  const fetchAccount = useServerFn(getMyAccount);
  const link = useServerFn(linkMyOrders);
  const { data, refetch } = useQuery({ queryKey: ["my-account"], queryFn: () => fetchAccount() });

  useEffect(() => {
    link().then((r) => {
      if (r.linked > 0) refetch();
    });
  }, [link, refetch]);

  const cards = [
    { label: "Total orders", value: data?.stats.totalOrders ?? 0, icon: Package },
    { label: "Completed", value: data?.stats.completed ?? 0, icon: CheckCircle2 },
    { label: "Pending", value: data?.stats.pending ?? 0, icon: Clock },
    { label: "Total spent", value: priceTag(data?.stats.spent ?? 0), icon: Wallet },
  ];

  const recent = (data?.orders ?? []).slice(0, 5);

  return (
    <AccountShell title="My account" subtitle={data?.email ? `Signed in as ${data.email}` : undefined}>
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="admin-panel rounded-2xl p-4 lg:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-muted-foreground">{c.label}</p>
              <c.icon className="size-4 shrink-0 text-primary" />
            </div>
            <p className="mt-3 text-2xl font-extrabold tracking-tight tabular-nums lg:text-3xl">{c.value}</p>
          </div>
        ))}
      </div>


      <Card className="mt-6 bg-card/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent orders</CardTitle>
          <Link to="/account/orders" className="inline-flex items-center gap-1 text-sm text-primary">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No orders yet.{" "}
              <Link to="/store" className="text-primary">
                Browse the store
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-border/70 text-sm">
              {recent.map((o: any) => (
                <li key={o.order_no} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="font-medium">
                    #{o.order_no} · {o.quantity}× {o.product_name}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground">{priceTag(o.total)}</span>
                    <span className={`text-xs font-semibold uppercase ${statusTone(o.status)}`}>{o.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AccountShell>
  );
}
