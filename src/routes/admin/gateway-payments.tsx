import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listGatewayPayments } from "@/lib/admin.functions";
import { AdminShell } from "@/components/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaymentReconciliationList } from "@/components/PaymentReconciliationList";

export const Route = createFileRoute("/admin/gateway-payments")({
  head: () => ({
    meta: [
      { title: "USDT & Gateway Payments — QORIX Admin" },
      { name: "description", content: "Review QORIX Bybit, TRC20, BEP20, EPS and OxaPay payment attempts and manual reconciliation." },
      { property: "og:title", content: "USDT & Gateway Payments — QORIX Admin" },
      { property: "og:description", content: "QORIX payment history and verified or unverified deposit review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GatewayPaymentsPage,
});

const DAYS = [1, 7, 30, 90];
const OK = new Set(["credited", "completed", "paid"]);
const BAD = new Set(["failed", "cancelled", "expired", "refunded"]);

function GatewayPaymentsPage() {
  const [gateway, setGateway] = useState<"bybit" | "eps" | "oxapay" | "chain_trc20" | "chain_bep20">("bybit");
  const standardGateway = gateway === "eps" || gateway === "oxapay" ? gateway : "bybit";
  const [days, setDays] = useState(7);
  const [status, setStatus] = useState<"all" | "ok" | "pending" | "bad">("all");
  const [q, setQ] = useState("");
  const fetchRows = useServerFn(listGatewayPayments);
  const { data, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["gateway-payments", gateway, days],
    queryFn: () => fetchRows({ data: { gateway: standardGateway, days } }),
    enabled: !gateway.startsWith("chain_"),
    refetchInterval: 30000,
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });
  const rows = data?.ok ? data.rows : [];
  const kindOf = (s: string) => (OK.has(s) ? "ok" : BAD.has(s) ? "bad" : "pending");
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) =>
    (status === "all" || kindOf(r.status) === status) &&
    (!needle || [r.ref, r.who, r.what, r.tx, String(r.amount)].some((v) => String(v ?? "").toLowerCase().includes(needle))),
  );
  const received = rows.filter((r) => kindOf(r.status) === "ok").reduce((s, r) => s + r.amount, 0);
  const count = (k: string) => rows.filter((r) => kindOf(r.status) === k).length;

  return (
    <AdminShell
      title="USDT & Gateway Payments"
      subtitle="Bybit, blockchain USDT, EPS and OxaPay payment history."
      actions={<Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Refreshing…" : "Refresh"}</Button>}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {(["bybit", "chain_bep20", "chain_trc20", "eps", "oxapay"] as const).map((g) => (
          <Button key={g} variant={gateway === g ? "default" : "outline"} onClick={() => setGateway(g)}>{g === "bybit" ? "Bybit Pay" : g === "chain_bep20" ? "USDT BEP20" : g === "chain_trc20" ? "USDT TRC20" : g === "eps" ? "EPS" : "OxaPay (Crypto)"}</Button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {DAYS.map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d === 1 ? "24 hours" : `${d} days`}</Button>
        ))}
        <Input className="max-w-xs" placeholder="Search ID, user, amount, Tx…" value={q} onChange={(e) => setQ(e.target.value)} />
        {dataUpdatedAt > 0 && <span className="text-xs text-muted-foreground">Updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>}
      </div>

      {(gateway === "bybit" || gateway === "chain_trc20" || gateway === "chain_bep20") && <div className="mb-6"><PaymentReconciliationList key={`${gateway}:${days}`} gateway={gateway} days={days} /></div>}
      {!gateway.startsWith("chain_") && <>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Received (USD)</div><div className="text-lg font-semibold text-success">${received.toFixed(2)}</div></CardContent></Card>
        {([["ok", "Completed"], ["pending", "Pending"], ["bad", "Failed / expired"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setStatus(status === k ? "all" : k)} className="text-left">
            <Card className={status === k ? "border-primary" : ""}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-lg font-semibold">{count(k)}</div></CardContent></Card>
          </button>
        ))}
      </div>

      {data && !data.ok && <Card className="mb-4 border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{data.error}</CardContent></Card>}

      <Card>
        <CardContent className="p-0">
          {!data && !error && <div className="p-6 text-sm text-muted-foreground">Loading payments…</div>}
          {!data && error && <div className="p-6 text-sm text-destructive">Could not load. <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button></div>}
          {data?.ok && shown.length === 0 && <div className="p-6 text-sm text-muted-foreground">No payments in this period.</div>}
          <div className="divide-y divide-border">
            {shown.map((r) => {
              const k = kindOf(r.status);
              return (
                <div key={r.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{r.what} <span className="text-xs text-muted-foreground">· {r.source}{r.method ? ` · ${r.method}` : ""}</span></div>
                    <div className="text-xs text-muted-foreground">{new Date(r.time).toLocaleString()} · {r.who}</div>
                    <div className="break-all text-[11px] text-muted-foreground">ID: {r.ref}{r.tx ? ` · Tx: ${r.tx}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${k === "ok" ? "text-success" : k === "bad" ? "text-destructive" : "text-warning"}`}>${r.amount.toFixed(2)}</div>
                    <div className="text-xs capitalize text-muted-foreground">{r.status}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      </>}
    </AdminShell>
  );
}
