import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getReferralRewardsAdmin, reviewReferralReward } from '@/lib/referral-rewards.functions';
import { AdminShell } from '@/components/AdminShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

export const Route = createFileRoute('/admin/referral-requests')({
  head: () => ({ meta: [
    { title: 'Referral Requests — QORIX Admin' },
    { name: 'description', content: 'Review QORIX referral product reward requests and delivery status.' },
    { property: 'og:title', content: 'Referral Requests — QORIX Admin' },
    { property: 'og:description', content: 'Approve or reject referral points rewards.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }), component: ReferralRequestsPage,
});
function ReferralRequestsPage() {
  const fetchRows = useServerFn(getReferralRewardsAdmin);
  const review = useServerFn(reviewReferralReward);
  const qc = useQueryClient();
  const { data, error, refetch } = useQuery({ queryKey: ['referral-rewards-admin'], queryFn: () => fetchRows(), refetchInterval: 30000 });
  const [selected, setSelected] = useState<{ id: string; name: string; approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await review({ data: { id: selected.id, approve: selected.approve } });
      if (!r.ok) toast.error(r.reason === 'stock' ? 'No stock available. Request remains pending.' : r.reason === 'disabled' ? 'Enable Points & Product Rewards first.' : 'Request cannot be approved right now.');
      else { toast.success(r.status === 'rejected' ? 'Rejected — points returned' : 'Approved — delivery queued'); setSelected(null); }
      await refetch(); await qc.invalidateQueries({ queryKey: ['pending-approvals-count'] });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not review request'); }
    finally { setBusy(false); }
  }
  return <AdminShell title="Referral Requests">
    {error && <p className="text-destructive">Could not load requests.</p>}
    <div className="divide-y divide-border">
      {data?.requests.map(r => <article key={r.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="min-w-0"><h2 className="font-semibold break-words">{r.product_name}</h2><p className="text-sm text-muted-foreground">Telegram {r.telegram_id} · {r.credits} points</p><p className="text-xs text-muted-foreground">{new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19)} UTC</p></div>
        <div className="flex items-center gap-2"><Badge variant={r.status === 'pending' ? 'destructive' : 'secondary'}>{r.status}</Badge>{r.status === 'pending' && <><Button onClick={() => setSelected({ id: r.id, name: r.product_name, approve: true })}>Approve</Button><Button variant="outline" onClick={() => setSelected({ id: r.id, name: r.product_name, approve: false })}>Reject</Button></>}</div>
      </article>)}
      {data && !data.requests.length && <p className="py-8 text-muted-foreground">No referral requests yet.</p>}
    </div>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !busy) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>{selected?.approve ? 'Approve reward delivery?' : 'Reject reward request?'}</DialogTitle></DialogHeader><p>{selected?.name}</p><p className="text-sm text-muted-foreground">{selected?.approve ? 'One account will be reserved from your unsold stock and sent to this customer.' : 'Reserved points will be returned to this customer.'}</p><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button><Button disabled={busy} onClick={confirm}>{busy ? 'Processing…' : 'Confirm'}</Button></DialogFooter></DialogContent></Dialog>
  </AdminShell>;
}