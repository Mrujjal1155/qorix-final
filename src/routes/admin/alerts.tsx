import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminShell, AdminPanel } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { getStockAlertStats, retryStockAlert, getAlertQueue, deleteAllPendingAlerts } from "@/lib/alerts.functions";
import { formatEta, minQueueMinutes, NOTICES_PER_MINUTE } from "@/lib/alert-queue-eta";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/alerts")({
  head: () => ({
    meta: [
      { title: "Alert health — Shop Bot Admin" },
      { name: "description", content: "Delivery rate, failures, retries and latency for every stock alert." },
      { property: "og:title", content: "Alert health — Shop Bot Admin" },
      { property: "og:description", content: "Stock alert delivery health and trends." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsPage,
});

const RANGES = [
  { label: "24 hours", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
] as const;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function BreakdownTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No alerts in this period.</p>;
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">Group</th>
            <th className="py-2 pr-3 font-semibold">Total</th>
            <th className="py-2 pr-3 font-semibold">Sent</th>
            <th className="py-2 pr-3 font-semibold">Failed</th>
            <th className="py-2 pr-3 font-semibold">Waiting</th>
            <th className="py-2 font-semibold">Success</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/60">
              <td className="py-2 pr-3 font-medium capitalize">{r.label}</td>
              <td className="py-2 pr-3">{r.total}</td>
              <td className="py-2 pr-3 text-success">{r.delivered}</td>
              <td className="py-2 pr-3 text-destructive">{r.failed}</td>
              <td className="py-2 pr-3">{r.pending}</td>
              <td className="py-2">{r.total ? Math.round((r.delivered / r.total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueuePanel() {
  const fetchQueue = useServerFn(getAlertQueue);
  const wipe = useServerFn(deleteAllPendingAlerts);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["alert-queue"],
    queryFn: () => fetchQueue(),
    refetchInterval: 5000,
  });
  const minutes = data ? minQueueMinutes(data.pendingRecipients, data.pendingEvents) : 0;
  const total = (data?.pendingRecipients ?? 0) + (data?.pendingEvents ?? 0);

  async function onDeleteAll() {
    setBusy(true);
    try {
      const r = await wipe();
      toast.success(`Deleted ${r.recipients} customer notices and ${r.events} alerts`);
      qc.invalidateQueries({ queryKey: ["alert-queue"] });
      qc.invalidateQueries({ queryKey: ["stock-alert-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPanel title="Live waiting queue">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Customer notices waiting" value={String(data?.pendingRecipients ?? "…")} hint="Stock add / stock out / broadcast messages to bot users" />
          <Stat label="Alerts waiting" value={String(data?.pendingEvents ?? "…")} hint={data ? Object.entries(data.byKind).map(([k, v]) => `${k}: ${v}`).join(" · ") || "None" : undefined} />
          <Stat label="Minimum time to finish" value={data ? formatEta(minutes) : "…"} hint={`Best case: up to ${NOTICES_PER_MINUTE} messages per minute`} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={busy || total === 0}>All Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all waiting notifications?</AlertDialogTitle>
                <AlertDialogDescription>
                  {total} unsent notifications will be removed permanently and never sent. Already-sent history stays.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDeleteAll}>All Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <span className="text-xs text-muted-foreground">
            Auto-refresh every 5s{data ? ` · checked ${new Date(data.checkedAt).toLocaleTimeString()}` : ""}
          </span>
        </div>
      </div>
    </AdminPanel>
  );
}

function AlertsPage() {
  const [days, setDays] = useState<number>(7);
  const fetchStats = useServerFn(getStockAlertStats);
  const retry = useServerFn(retryStockAlert);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["stock-alert-stats", days],
    queryFn: () => fetchStats({ data: { days } }),
    refetchInterval: 60000,
  });

  const maxDay = Math.max(1, ...(data?.trend ?? []).map((t: any) => t.total));

  async function onRetry(id: string) {
    try {
      await retry({ data: { id } });
      toast.success("Alert re-queued");
      qc.invalidateQueries({ queryKey: ["stock-alert-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  }

  return (
    <AdminShell title="Alert health" subtitle="Stock alert delivery rate, failures, retries and latency">
      <div className="space-y-5">
        <QueuePanel />
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? "default" : "outline"}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Delivery rate" value={`${data.deliveryRate}%`} hint={`${data.totals.delivered} of ${data.totals.total} alerts sent`} />
              <Stat label="Failed" value={String(data.totals.failed)} hint={`${data.totals.pending} still waiting / retrying`} />
              <Stat label="Retry attempts" value={String(data.totals.attempts)} hint="Total delivery attempts after a failure" />
              <Stat label="Latency" value={`${data.avgLatencySec}s`} hint={`95th percentile ${data.p95LatencySec}s`} />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <AdminPanel title="By source">
                <BreakdownTable rows={data.bySource} />
              </AdminPanel>
              <AdminPanel title="By alert type">
                <BreakdownTable rows={data.byKind} />
              </AdminPanel>
            </div>

            <AdminPanel title="Daily trend">
              {data.trend.length === 0 ? (
                <p className="text-sm text-muted-foreground">No alerts in this period.</p>
              ) : (
                <div className="min-w-0 overflow-x-auto">
                  <div className="flex min-w-max items-end gap-2">
                    {data.trend.map((t: any) => (
                      <div key={t.day} className="flex w-10 flex-col items-center gap-1">
                        <div className="flex h-32 w-full flex-col justify-end gap-0.5">
                          {t.failed > 0 && (
                            <div
                              className="w-full rounded-t bg-destructive"
                              style={{ height: `${(t.failed / maxDay) * 100}%` }}
                            />
                          )}
                          <div
                            className="w-full rounded-t bg-primary"
                            style={{ height: `${(t.delivered / maxDay) * 100}%` }}
                          />
                        </div>
                        <span className="text-[0.6rem] text-muted-foreground">{t.day.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AdminPanel>

            <AdminPanel title="Failed & retrying alerts">
              {data.problems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing stuck — every alert went out.</p>
              ) : (
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-semibold">Product</th>
                        <th className="py-2 pr-3 font-semibold">Type</th>
                        <th className="py-2 pr-3 font-semibold">Tries</th>
                        <th className="py-2 pr-3 font-semibold">Error</th>
                        <th className="py-2 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.problems.map((p: any) => (
                        <tr key={p.id} className="border-t border-border/60 align-top">
                          <td className="py-2 pr-3 font-medium">{p.productName}</td>
                          <td className="py-2 pr-3 capitalize">{p.kind}</td>
                          <td className="py-2 pr-3">{p.attempts}</td>
                          <td className="max-w-[16rem] py-2 pr-3 text-xs text-muted-foreground">
                            {p.lastError ?? "—"}
                          </td>
                          <td className="py-2">
                            <Button size="sm" variant="outline" onClick={() => onRetry(p.id)}>
                              Retry
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminPanel>
          </>
        )}
      </div>
    </AdminShell>
  );
}
