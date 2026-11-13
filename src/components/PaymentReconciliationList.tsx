import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listReconciliationPayments, reconcileManualPayment } from "@/lib/payment-reconciliation.functions";
import type { ReconciliationGateway } from "@/lib/payment-reconciliation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const labels = { verified: "Verified", manual_verified: "Verified · manual", used: "Already used · review", unverified: "Unverified", no_id: "No TXID submitted" };
export function PaymentReconciliationList({ gateway, days }: { gateway: ReconciliationGateway; days: number }) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const load = useServerFn(listReconciliationPayments);
  const save = useServerFn(reconcileManualPayment);
  const query = useQuery({ queryKey: ["payment-reconciliation", gateway, days, page], queryFn: () => load({ data: { gateway, days, page } }), refetchInterval: 30000 });
  type Row = NonNullable<typeof query.data>["rows"][number];
  const [selected, setSelected] = useState<Row | null>(null);
  const needle = filter.toLowerCase().trim();
  const rows = (query.data?.rows ?? []).filter(r => !needle || [r.id, r.who, r.txid, r.status, labels[r.state]].some(value => String(value ?? "").toLowerCase().includes(needle)));
  async function submit() {
    if (!selected?.txid || !confirmed) return;
    setBusy(true); setFeedback("");
    try {
      await save({ data: { depositId: selected.id, txid: selected.txid, reason, alreadyCredited: true } });
      setSelected(null); setFeedback("Verified manually. Transaction reserved; no balance was added and no order was delivered.");
      await query.refetch();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Could not reconcile payment."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="mr-auto text-lg font-semibold">Submitted payment attempts</h2>
      <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}>Refresh</Button>
      <Input className="max-w-xs" placeholder="Search this page: user, TXID, status" value={filter} onChange={e => setFilter(e.target.value)} />
    </div>
    {feedback && <p role="status" className="break-words text-sm text-warning">{feedback}</p>}
    {query.error && <p role="alert" className="text-sm text-destructive">Could not load verification status.</p>}
    {query.isPending && <p className="text-sm text-muted-foreground">Loading payment attempts…</p>}
    {!query.isPending && !query.error && rows.length === 0 && <p className="text-sm text-muted-foreground">No matching attempts.</p>}
    <div className="divide-y divide-border border-y border-border">
      {rows.map(row => <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
        <div className="min-w-0 flex-1 basis-60 space-y-1">
          <p className="font-medium">{row.checkout ? "Order checkout" : "Wallet deposit"} · {row.who}</p>
          <p className="text-xs text-muted-foreground">{new Date(row.time).toISOString().replace("T", " ").slice(0, 19)} UTC · {row.status}</p>
          <p className="break-all font-mono text-xs">D-{row.id}</p>
          <p className="break-all font-mono text-xs">{row.txid ?? "—"}</p>
          {row.audit && <p className="break-all text-xs text-muted-foreground">Admin: {row.audit.admin} · {new Date(row.audit.time).toISOString()} · {row.audit.reason}</p>}
        </div>
        <div className="space-y-2 text-right">
          <p className="font-semibold">${row.amount.toFixed(2)}</p>
          <p className={row.state === "verified" || row.state === "manual_verified" ? "text-success" : "text-warning"}>{labels[row.state]}</p>
          {row.canReconcile && <Button size="sm" variant="outline" onClick={() => { setSelected(row); setReason(""); setConfirmed(false); setFeedback(""); }}>Unverified · reconcile</Button>}
        </div>
      </div>)}
    </div>
    <div className="flex items-center justify-end gap-3">
      <span className="text-xs text-muted-foreground">Page {page + 1} · {query.data?.total ?? 0} attempts</span>
      <Button size="sm" variant="outline" disabled={page === 0 || query.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button>
      <Button size="sm" variant="outline" disabled={query.isFetching || (page + 1) * 100 >= (query.data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button>
    </div>
    <Dialog open={selected != null} onOpenChange={open => { if (!open && !busy) setSelected(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Confirm manual payment reconciliation</DialogTitle><DialogDescription>This reserves the transaction permanently without adding balance or delivering an order. Confirm only after checking the payment and the manual wallet credit.</DialogDescription></DialogHeader>
        <p className="break-all text-sm">User: {selected?.who} · ${selected?.amount.toFixed(2)}<br />TXID: {selected?.txid}</p>
        <Input aria-label="Reconciliation reason" placeholder="Reason / manual credit reference" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked the payment and already added this amount manually to this user's wallet.</label>
        {feedback && <p role="alert" className="text-sm text-destructive">{feedback}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button><Button disabled={busy || !confirmed || reason.trim().length < 5} onClick={submit}>{busy ? "Saving…" : "Mark verified · no credit"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}