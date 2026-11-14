import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getReferralRewardsAdmin, saveReferralReward } from '@/lib/referral-rewards.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export function ReferralRewardsSettings() {
  const fetchRows = useServerFn(getReferralRewardsAdmin);
  const save = useServerFn(saveReferralReward);
  const { data, refetch, error } = useQuery({ queryKey: ['referral-rewards-admin'], queryFn: () => fetchRows() });
  const [product, setProduct] = useState('');
  const [points, setPoints] = useState('10');
  const [busy, setBusy] = useState(false);
  async function persist(d: { id?: string; product_id: string; credits: number; is_active: boolean }) {
    setBusy(true);
    try { await save({ data: d }); await refetch(); toast.success('Reward saved'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save reward'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 border-t border-border pt-5">
    <h3 className="font-semibold">Product rewards</h3>
    {error && <p className="text-destructive">Could not load rewards.</p>}
    <div className="grid gap-3 sm:grid-cols-[1fr_100px_auto]">
      <div className="space-y-2"><Label>In-house product</Label><Select value={product} onValueChange={setProduct}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{data?.products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Points</Label><Input aria-label="Reward points" type="number" min="1" step="1" value={points} onChange={e => setPoints(e.target.value)} /></div>
      <Button className="self-end" disabled={busy || !product || !Number.isInteger(Number(points)) || Number(points) < 1} onClick={() => persist({ product_id: product, credits: Number(points), is_active: true })}>Add reward</Button>
    </div>
    {data?.rewards.map(r => <div key={r.id} className="flex items-center justify-between gap-4 border-b border-border py-3">
      <div><p className="font-medium">{(r.products as { name: string } | null)?.name ?? 'Product'}</p><p className="text-sm text-muted-foreground">{r.credits} points</p></div>
      <Switch aria-label={`Enable reward ${r.id}`} checked={r.is_active} disabled={busy} onCheckedChange={checked => persist({ id: r.id, product_id: r.product_id, credits: Number(r.credits), is_active: checked })} />
    </div>)}
  </section>;
}