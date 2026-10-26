import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { money } from "@/components/AdminShell";
import { getProductSales } from "@/lib/product-sales.functions";
import { saleChannel, summarizeSales } from "@/lib/product-sales";
import { DEFAULT_ORDER_TIMEZONE } from "@/lib/order-time";

const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: DEFAULT_ORDER_TIMEZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });

export function ProductSalesDialog({ productId, productName, onClose }: { productId: string; productName: string; onClose: () => void }) {
  const fetchSales = useServerFn(getProductSales);
  const q = useQuery({ queryKey: ["product-sales", productId], queryFn: () => fetchSales({ data: { productId } }) });
  const rows = q.data?.rows ?? [];
  const s = summarizeSales(rows);
  const max = Math.max(1, ...s.daily.map((d) => d.qty));
  const stats = [["Today", s.today], ["7 days", s.last7], ["30 days", s.last30], ["All time", s.all]] as const;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words pr-6">Sales · {productName}</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-destructive">Could not load sales.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {stats.map(([label, b]) => (
                <div key={label} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-xl font-semibold">{b.qty} <span className="text-xs font-normal text-muted-foreground">sold</span></div>
                  <div className="text-xs text-muted-foreground">{b.orders} orders · {money(b.revenue)}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-2 text-xs text-muted-foreground">Last 30 days (Bangladesh time)</div>
              <div className="flex h-28 items-end gap-[2px]">
                {s.daily.map((d) => (
                  <div key={d.day} title={`${d.day}: ${d.qty}`} className="flex-1 rounded-t bg-primary/80" style={{ height: `${Math.max(2, (d.qty / max) * 100)}%`, opacity: d.qty ? 1 : 0.25 }} />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{s.daily[0]?.day}</span><span>{s.daily[s.daily.length - 1]?.day}</span>
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs text-muted-foreground">Sales history ({rows.length})</div>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed sales yet.</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {rows.slice(0, 300).map((r) => (
                    <div key={r.order_no} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">#{r.order_no} · {r.quantity} pcs</div>
                        <div className="text-xs text-muted-foreground">{fmt.format(new Date(r.created_at))}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{saleChannel(r)}</Badge>
                        <span className="font-semibold">{money(Number(r.total))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
