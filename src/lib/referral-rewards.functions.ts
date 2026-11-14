import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

async function admin(context: any) {
  const { data, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (error || !data) throw new Error('Forbidden');
}
export const getReferralRewardsAdmin = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
    await admin(context);
    const sb = context.supabase;
    const [rewards, requests] = await Promise.all([
      sb.from('referral_product_rewards').select('id,product_id,credits,is_active,products(name)').order('created_at'),
      sb.from('referral_reward_requests').select('id,telegram_id,product_name,credits,status,created_at,reviewed_at').order('created_at', { ascending: false }).limit(100),
    ]);
    if (rewards.error || requests.error) throw new Error('Could not load referral rewards.');
    const products: { id: string; name: string }[] = [];
    for (let from = 0; ; from += 500) {
      const res = await sb.from('products').select('id,name').is('supplier_id', null).is('owner_reseller_id', null).eq('delivery_type', 'auto').eq('is_active', true).order('id').range(from, from + 499);
      if (res.error) throw new Error('Could not load products.');
      products.push(...(res.data ?? []));
      if ((res.data?.length ?? 0) < 500) break;
    }
    return { rewards: rewards.data ?? [], requests: requests.data ?? [], products };
  });
export const saveReferralReward = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional(), product_id: z.string().uuid(), credits: z.number().int().min(1).max(1000000), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await admin(context);
    const row = { product_id: data.product_id, credits: data.credits, is_active: data.is_active, ...(data.id ? { id: data.id } : {}) };
    const { error } = await context.supabase.from('referral_product_rewards').upsert(row);
    if (error) throw new Error('Could not save reward. Select an in-house automatic product.');
    return { ok: true };
  });
export const reviewReferralReward = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await admin(context);
    const { data: result, error } = await context.supabase.rpc('review_referral_reward', { _request: data.id, _approve: data.approve });
    if (error) throw new Error('Could not review referral request.');
    const r = result as { ok: boolean; reason?: string; status?: string };
    if (r.ok && r.status === 'approved') {
      const { backgroundWaitUntil } = await import('@/lib/bg.server');
      const { drainReferralRewards } = await import('@/lib/referral-rewards.server');
      const work = drainReferralRewards().catch(() => ({ sent: 0 }));
      if (!backgroundWaitUntil(work)) await work;
    }
    return r;
  });