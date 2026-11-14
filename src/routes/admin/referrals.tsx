import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { listReferralCommissions } from "@/lib/admin.functions";
import { formatExactAmount } from "@/lib/referral-commission";
import { AdminShell } from "@/components/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/referrals")({
  head: () => ({
    meta: [
      { title: "Referral Commissions — Shop Bot Admin" },
      {
        name: "description",
        content: "Every lifetime referral commission paid from the shop's actual net profit, with the order it came from.",
      },
      { property: "og:title", content: "Referral Commissions — Shop Bot Admin" },
      {
        property: "og:description",
        content: "Referrer, referred customer, order, admin net profit and commission paid.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralCommissionsPage,
});

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "credited", label: "Credited" },
  { value: "reversed", label: "Reversed" },
  { value: "skipped", label: "Skipped" },
];

function statusBadge(status: string) {
  const tone =
    status === "credited"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : status === "reversed"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={tone}>{status}</Badge>;
}

function timeOf(value: string) {
  const d = new Date(value);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";
}

function ReferralCommissionsPage() {
  const fetchRows = useServerFn(listReferralCommissions);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);
  useEffect(() => setPage(0), [q, status]);

  const { data, isFetching } = useQuery({
    queryKey: ["referral-commissions", q, status, page],
    queryFn: () => fetchRows({ data: { q, status, page } }),
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminShell title="Referral Commissions" subtitle="5% of the shop's actual net profit, paid to the referrer for every purchase their invited customers make.">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Credited</p>
            <p className="text-2xl font-semibold text-emerald-400">{data?.stats.credited ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Reversed</p>
            <p className="text-2xl font-semibold text-amber-400">{data?.stats.reversed ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Skipped</p>
            <p className="text-2xl font-semibold text-muted-foreground">{data?.stats.skipped ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Order number, customer id or product name"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <table className="w-full min-w-260 text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Referrer</th>
                <th className="py-2 pr-4">Referred customer</th>
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4 text-right">Admin net profit</th>
                <th className="py-2 pr-4 text-right">Rate</th>
                <th className="py-2 pr-4 text-right">Commission</th>
                <th className="py-2 pr-4 text-right">Paid to wallet</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{timeOf(r.created_at)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{r.referrer_label}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{r.buyer_label}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {r.order_no != null ? `#${r.order_no}` : String(r.id).slice(0, 8)}
                  </td>
                  <td className="py-2 pr-4 max-w-60 truncate" title={r.product_name ?? ""}>
                    {r.product_name ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap">{formatExactAmount(r.admin_profit)}</td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap">{Number(r.percent ?? 0)}%</td>
                  <td className="py-2 pr-4 text-right font-medium whitespace-nowrap">{formatExactAmount(r.amount)}</td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap text-muted-foreground">
                    {formatExactAmount(r.wallet_amount ?? r.amount)}
                  </td>
                  <td className="py-2">{statusBadge(String(r.status))}</td>
                </tr>
              ))}
              {!rows.length && !isFetching && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    No referral commissions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {total} commission{total === 1 ? "" : "s"} · page {page + 1} of {pages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="size-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              >
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
