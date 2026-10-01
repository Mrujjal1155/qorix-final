import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBotUserHistory } from "@/lib/admin.functions";
import { money } from "@/components/AdminShell";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDownCircle, ArrowUpCircle, Clock, ShoppingBag, Wallet } from "lucide-react";

type Target = { telegram_id: number; label: string; balance: number; spent?: number };
type Filter = "all" | "deposit" | "purchase" | "other";

type Row = {
  key: string;
  at: string;
  kind: "deposit" | "purchase" | "other";
  title: string;
  sub: string;
  amount: number;
  status?: string | null;
};

function fmt(at: string) {
  return new Date(at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function statusBadgeClass(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (["completed", "credited", "approved", "delivered", "active", "paid"].includes(s))
    return "bg-success/15 text-success border border-success/30";
  if (["failed", "rejected", "cancelled", "canceled", "error", "out_of_stock"].includes(s))
    return "bg-destructive/15 text-destructive border border-destructive/30";
  if (["expired", "pending", "waiting", "processing", "retrying", "unverified"].includes(s))
    return "bg-warning/15 text-warning border border-warning/30";
  return "";
}

export function UserHistoryDialog({ user, onClose }: { user: Target | null; onClose: () => void }) {
  const fetchHistory = useServerFn(getBotUserHistory);
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ["botUserHistory", user?.telegram_id],
    enabled: !!user,
    queryFn: () => fetchHistory({ data: { telegram_id: user!.telegram_id } }) as Promise<any>,
  });

  const { rows, totals } = useMemo(() => {
    const out: Row[] = [];
    const t = { deposited: 0, purchased: 0, orders: 0 };
    if (!data) return { rows: out, totals: t };
    for (const o of data.orders as any[]) {
      out.push({
        key: `o${o.id}`,
        at: o.created_at,
        kind: "purchase",
        title: `${o.product_name} × ${o.quantity}`,
        sub: `Order #${o.order_no} · ${o.delivery_type} · ${o.payment_method || "wallet"}`,
        amount: -Number(o.total || 0),
        status: o.status,
      });
      if (o.status === "completed") { t.purchased += Number(o.total || 0); t.orders++; }
    }
    for (const x of data.transactions as any[]) {
      if (x.type === "purchase") continue; // shown via orders
      const amt = Number(x.amount || 0);
      const isDep = x.type === "deposit";
      if (isDep) t.deposited += amt;
      out.push({
        key: `t${x.id}`,
        at: x.created_at,
        kind: isDep ? "deposit" : "other",
        title: isDep ? `Deposit${x.method ? ` · ${x.method}` : ""}` : `${x.type}${x.method ? ` · ${x.method}` : ""}`,
        sub: [x.note, x.reference].filter(Boolean).join(" · "),
        amount: amt,
        status: x.status,
      });
    }
    for (const p of data.payments as any[]) {
      if (p.status === "approved") continue; // credited deposit already in transactions
      out.push({
        key: `p${p.id}`, at: p.created_at, kind: "deposit",
        title: `Deposit request · ${p.method}`,
        sub: [p.txid && `TxID ${p.txid}`, p.admin_note].filter(Boolean).join(" · "),
        amount: Number(p.amount || 0), status: p.status,
      });
    }
    for (const d of data.deposits as any[]) {
      if (d.status === "completed" || d.status === "credited") continue;
      out.push({
        key: `b${d.id}`, at: d.created_at, kind: "deposit",
        title: `Binance ${d.kind}${d.network ? ` · ${d.network}` : ""}`,
        sub: d.tx_id ? `TxID ${d.tx_id}` : "",
        amount: Number(d.amount_usdt || 0), status: d.status,
      });
    }
    out.sort((a, b) => +new Date(b.at) - +new Date(a.at));
    return { rows: out, totals: t };
  }, [data]);

  const shown = filter === "all" ? rows : rows.filter((r) => r.kind === filter);

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{user?.label} — history</DialogTitle>
          <DialogDescription>Telegram ID {user?.telegram_id}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { l: "Balance", v: money(user?.balance ?? 0) },
            { l: "Deposited", v: money(totals.deposited) },
            { l: "Purchased", v: money(totals.purchased) },
            { l: "Orders", v: String(totals.orders) },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-secondary/50 p-2.5 text-center">
              <p className="text-[11px] text-muted-foreground">{s.l}</p>
              <p className="text-sm font-semibold">{s.v}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["all", "deposit", "purchase", "other"] as Filter[]).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "deposit" ? "Deposits" : f === "purchase" ? "Purchases" : "Other"}
            </Button>
          ))}
        </div>

        <div className="-mx-1 max-h-[50vh] space-y-2 overflow-y-auto px-1">
          {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading history…</p>}
          {error && <p className="py-6 text-center text-sm text-destructive">{(error as Error).message}</p>}
          {!isLoading && !error && shown.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
          )}
          {shown.map((r) => {
            const Icon = r.kind === "purchase" ? ShoppingBag : r.kind === "deposit" ? ArrowDownCircle : r.amount < 0 ? ArrowUpCircle : Wallet;
            const tone = r.kind === "purchase" ? "bg-primary/10 text-primary" : r.kind === "deposit" ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground";
            return (
              <div key={r.key} className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium capitalize">{r.title}</p>
                  {r.sub && <p className="truncate text-xs text-muted-foreground">{r.sub}</p>}
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="size-3" /> {fmt(r.at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-semibold ${r.amount >= 0 ? "text-success" : ""}`}>
                    {r.amount >= 0 ? "+" : "−"}{money(Math.abs(r.amount))}
                  </p>
                  {r.status && <Badge variant="secondary" className="mt-1 text-[10px]">{r.status}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
