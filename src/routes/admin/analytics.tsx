import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAnalytics, getOverview } from "@/lib/admin.functions";
import { AdminShell, AdminPanel, money } from "@/components/AdminShell";
import { MapPin } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const RANGES = [
  { key: "day", label: "Today" },
  { key: "week", label: "7 days" },
  { key: "month", label: "30 days" },
  { key: "quarter", label: "3 months" },
] as const;

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — QORIX Store Admin" },
      { name: "description", content: "Daily, weekly, monthly and quarterly sales, revenue and profit analytics." },
      { property: "og:title", content: "Analytics — QORIX Store Admin" },
      { property: "og:description", content: "Sales and profit analytics for your store." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("week");
  const fetchAnalytics = useServerFn(getAnalytics);
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["analytics", range],
    queryFn: () => fetchAnalytics({ data: { range } }),
  });
  const fetchOverview = useServerFn(getOverview);
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: () => fetchOverview(),
  });

  const recent: any[] = (overview?.recentOrders ?? []) as any[];
  const chartData = [...recent]
    .reverse()
    .map((o, i) => ({ name: `#${o.order_no ?? i + 1}`, value: Number(o.total ?? 0) }));

  const series = (analytics?.series ?? []).map((s) => ({
    ...s,
    label: new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  return (
    <AdminShell title="Analytics" subtitle="Sales, revenue and profit breakdown by period">
      <AdminPanel
        title="Performance"
        action={
          <div className="flex flex-wrap gap-1 rounded-full border border-border bg-background/60 p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={
                  range === r.key
                    ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    : "rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Sales (completed)", value: analytics?.totals.completedOrders ?? 0 },
            { label: "Units sold", value: analytics?.totals.units ?? 0 },
            { label: "Revenue", value: money(analytics?.totals.revenue ?? 0) },
            { label: "Profit", value: money(analytics?.totals.profit ?? 0) },
            { label: "Avg order value", value: money(analytics?.totals.avgOrderValue ?? 0) },
            { label: "Margin", value: `${(analytics?.totals.margin ?? 0).toFixed(1)}%` },
            { label: "Pending orders", value: analytics?.totals.pendingOrders ?? 0 },
            { label: "Total orders", value: analytics?.totals.orders ?? 0 },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border/70 bg-background/40 p-3">
              <p className="truncate text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-1 truncate text-lg font-bold tabular-nums">
                {analyticsLoading ? "…" : k.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.length ? series : [{ label: "—", revenue: 0, profit: 0, orders: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} stroke="var(--border)" interval="preserveStartEnd" />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} stroke="var(--border)" width={40} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  color: "var(--foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="profit" name="Profit" fill="var(--success)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Date</th>
                <th className="py-2 text-right">Sales</th>
                <th className="py-2 text-right">Units</th>
                <th className="py-2 text-right">Revenue</th>
                <th className="py-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((s) => (
                <tr key={s.date} className="border-t border-border/60">
                  <td className="py-2">{s.label}</td>
                  <td className="py-2 text-right tabular-nums">{s.orders}</td>
                  <td className="py-2 text-right tabular-nums">{s.units}</td>
                  <td className="py-2 text-right tabular-nums">{money(s.revenue)}</td>
                  <td className="py-2 text-right tabular-nums text-success">{money(s.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(analytics?.topProducts?.length ?? 0) > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">Top products</p>
            <ul className="space-y-2">
              {analytics?.topProducts.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                  <span className="min-w-0 truncate text-sm">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {p.units} sold · <span className="font-semibold text-primary">{money(p.revenue)}</span> · profit {money(p.profit)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </AdminPanel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <AdminPanel
          title="Total sells"
          action={
            <span className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">
              Payment received across all channels
            </span>
          }
        >
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.length ? chartData : [{ name: "—", value: 0 }]}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} stroke="var(--border)" />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} stroke="var(--border)" width={36} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--foreground)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="url(#salesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AdminPanel>

        <AdminPanel title="Recent Orders">
          <ul className="space-y-3">
            {recent.slice(0, 6).map((o) => (
              <li key={o.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
                  <MapPin className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.product_name}</p>
                  <p className="truncate text-xs text-muted-foreground">#{o.order_no} · {o.telegram_id}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-primary">{money(o.total)}</p>
                  <p
                    className={
                      o.status === "completed"
                        ? "text-[0.65rem] font-bold uppercase tracking-wider text-success"
                        : "text-[0.65rem] font-bold uppercase tracking-wider text-warning"
                    }
                  >
                    {o.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {!overviewLoading && recent.length === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}
        </AdminPanel>
      </div>
    </AdminShell>
  );
}
