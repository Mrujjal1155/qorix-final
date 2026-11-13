import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listBinanceTransactions } from "@/lib/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PaymentReconciliationList } from "@/components/PaymentReconciliationList";

export function BinancePaymentHistory({ days, search }: { days: number; search: string }) {
  const fetchTx = useServerFn(listBinanceTransactions);
  const { data, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["binance-tx", days],
    queryFn: () => fetchTx({ data: { days } }),
    refetchInterval: 30000,
    retry: 1,
    // Show the previously loaded list instantly while fresh data loads in the background.
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
  const rows = data?.ok ? data.rows : [];
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => [r.id, r.orderId, r.counterparty, r.via, r.currency, String(r.amount)].some((v) => String(v ?? "").toLowerCase().includes(needle)))
    : rows;
  const totals = new Map<string, number>();
  for (const r of rows) if (r.direction === "in" && r.status !== "Wrong deposit") totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount);

  return (
    <section>
      <div className="mb-3 flex items-center justify-end gap-3">
        {dataUpdatedAt > 0 && <span className="text-xs text-muted-foreground">Updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>}
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>{isFetching ? "Refreshing…" : "Refresh"}</Button>
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
      <div className="mt-6"><PaymentReconciliationList key={days} gateway="payid" days={days} /></div>
    </section>
  );
}
