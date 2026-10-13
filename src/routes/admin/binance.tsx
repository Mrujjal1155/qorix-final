import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listBinanceTransactions } from "@/lib/admin.functions";
import { AdminShell } from "@/components/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/binance")({
  head: () => ({
    meta: [
      { title: "Binance Transactions — Shop Bot Admin" },
      { name: "description", content: "Live list of every Binance Pay transfer and coin deposit received on your Binance account." },
      { property: "og:title", content: "Binance Transactions — Shop Bot Admin" },
      { property: "og:description", content: "See every incoming Binance payment without opening Binance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BinancePage,
});

const DAYS = [1, 7, 30];

function BinancePage() {
  const [days, setDays] = useState(7);
  const [q, setQ] = useState("");
  const fetchTx = useServerFn(listBinanceTransactions);
  const { data, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["binance-tx", days],
    queryFn: () => fetchTx({ data: { days } }),
    refetchInterval: 30000,
    retry: 1,
  });
  const rows = data?.ok ? data.rows : [];
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => [r.id, r.orderId, r.counterparty, r.via, r.currency, String(r.amount)].some((v) => String(v ?? "").toLowerCase().includes(needle)))
    : rows;
  const totals = new Map<string, number>();
  for (const r of rows) if (r.direction === "in" && r.status !== "Wrong deposit") totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount);

  return (
    <AdminShell
      title="Binance Transactions"
      subtitle="Every Binance Pay transfer and coin deposit — refreshes every 30 seconds."
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {DAYS.map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            {d === 1 ? "24 hours" : `${d} days`}
          </Button>
        ))}
        <Input className="max-w-xs" placeholder="Search ID, name, amount…" value={q} onChange={(e) => setQ(e.target.value)} />
        {dataUpdatedAt > 0 && <span className="text-xs text-muted-foreground">Updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>}
      </div>

      {data && !data.ok && (
        <Card className="mb-4 border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{data.error}</CardContent></Card>
      )}
      {data?.ok && data.warnings.map((w) => (
        <div key={w} className="mb-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">{w}</div>
      ))}

      {totals.size > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[...totals].map(([c, v]) => (
            <Card key={c}><CardContent className="p-3"><div className="text-xs text-muted-foreground">Received ({c})</div><div className="text-lg font-semibold text-success">+{Number(v.toFixed(6))} {c}</div></CardContent></Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {!data && !error && <div className="p-6 text-sm text-muted-foreground">Loading from Binance…</div>}
          {!data && error && (
            <div className="p-6 text-sm text-destructive">
              Could not load: {error instanceof Error ? error.message : String(error)}
              <Button size="sm" variant="outline" className="ml-2" onClick={() => refetch()}>Try again</Button>
            </div>
          )}
          {data?.ok && shown.length === 0 && <div className="p-6 text-sm text-muted-foreground">No transactions in this period.</div>}
          <div className="divide-y divide-border">
            {shown.map((r) => (
              <div key={`${r.via}-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{r.via}</div>
                  <div className="text-xs text-muted-foreground">{r.time ? new Date(r.time).toLocaleString() : "—"}{r.counterparty ? ` · ${r.counterparty}` : ""}</div>
                  <div className="break-all text-[11px] text-muted-foreground">ID: {r.orderId ?? r.id}{r.orderId && r.orderId !== r.id ? ` · Tx: ${r.id}` : ""}</div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${r.direction === "in" ? "text-success" : "text-destructive"}`}>
                    {r.direction === "in" ? "+" : "−"}{r.amount} {r.currency}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.status}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
