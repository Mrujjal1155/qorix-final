import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOverview } from "@/lib/admin.functions";
import { AdminShell, AdminPanel, money } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Plus, Users, DollarSign, ShoppingBag, TrendingUp, Package, Boxes, PlugZap, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — QORIX Store Admin" },
      { name: "description", content: "Revenue, users, orders today and pending payments for your Telegram shop bot." },
      { property: "og:title", content: "Dashboard — QORIX Store Admin" },
      { property: "og:description", content: "Live stats for your Telegram digital product shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const fetchOverview = useServerFn(getOverview);
  const { data, isLoading } = useQuery({ queryKey: ["overview"], queryFn: () => fetchOverview() });

  const ps = data?.productStats;

  const productCards = [
    { label: "In-house products", value: ps?.inHouse ?? 0, note: `${ps?.inHouseActive ?? 0} active`, icon: Boxes },
    { label: "Supplier products", value: ps?.supplier ?? 0, note: `${ps?.supplierActive ?? 0} active`, icon: PlugZap },
    { label: "Total products", value: ps?.total ?? 0, note: `${ps?.inactive ?? 0} inactive`, icon: Package },
    { label: "Active products", value: ps?.active ?? 0, note: "Visible in store & bot", icon: CheckCircle2 },
  ];

  const stats = [
    { label: "Total users", value: data?.totalUsers ?? 0, icon: Users, delta: "+12%", up: true },
    { label: "Total revenue", value: money(data?.revenue), icon: DollarSign, delta: "+8%", up: true },
    { label: "Orders today", value: data?.ordersToday ?? 0, icon: ShoppingBag, delta: "+24%", up: true },
    { label: "Pending payments", value: data?.pendingPayments ?? 0, icon: TrendingUp, delta: "-4%", up: false },
  ];

  const highlights = [
    { value: `${data?.ordersToday ?? 0} new orders`, note: "Awaiting processing", icon: ShoppingBag, tone: "success" },
    { value: `${data?.pendingPayments ?? 0} payments`, note: "On hold", icon: TrendingUp, tone: "brand" },
    { value: `${data?.totalUsers ?? 0} users`, note: "Registered", icon: Users, tone: "primary" },
  ] as const;

  const toneClass = {
    success: "bg-success/15 text-success",
    brand: "bg-brand/15 text-brand",
    primary: "bg-primary/15 text-primary",
  } as const;

  return (
    <AdminShell
      title="Qorix Store Dashboard"
      subtitle="Here's what's going on at your business right now"
      actions={
        <Button className="gap-2 rounded-full font-semibold">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Add Product</span>
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-x-10 gap-y-5 border-b border-border/70 pb-7">
        {highlights.map((h) => (
          <div key={h.note} className="flex min-w-0 items-center gap-3">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${toneClass[h.tone]}`}>
              <h.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xl font-extrabold tracking-tight lg:text-2xl">
                {isLoading ? "…" : h.value}
              </p>
              <p className="truncate text-sm text-muted-foreground">{h.note}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-7 grid gap-4 grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="admin-panel rounded-2xl p-4 lg:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-muted-foreground">{s.label}</p>
              <s.icon className="size-4 shrink-0 text-primary" />
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
              <p className="text-2xl font-extrabold tracking-tight tabular-nums lg:text-3xl">
                {isLoading ? "…" : s.value}
              </p>
              <span className={s.up ? "text-xs font-semibold text-success" : "text-xs font-semibold text-brand"}>
                {s.delta}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 grid-cols-2 xl:grid-cols-4">
        {productCards.map((s) => (
          <div key={s.label} className="admin-panel rounded-2xl p-4 lg:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-muted-foreground">{s.label}</p>
              <s.icon className="size-4 shrink-0 text-primary" />
            </div>
            <p className="mt-3 text-2xl font-extrabold tracking-tight tabular-nums lg:text-3xl">
              {isLoading ? "…" : s.value}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{s.note}</p>
          </div>
        ))}
      </div>

    </AdminShell>
  );
}
