import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { deliverItemsToChat } from '@/lib/bot/deliver-items.server';

// Durable, leased deliveries use the saved credential, never a fresh stock claim.
export async function drainReferralRewards() {
  const db = supabaseAdmin as any;
  const { data, error } = await db.rpc('claim_referral_deliveries');
  if (error) return { sent: 0 };
  let sent = 0;
  for (const row of data ?? []) {
    let success = false;
    try {
      const result = await deliverItemsToChat(row.telegram_id, row.product_name, [row.content], { orderId: row.id });
      success = result.sent === 1 || result.fallbackFile;
    } catch { /* Leave saved credentials for retry. */ }
    const { error: finishError } = await db.rpc('finish_referral_delivery', { _request: row.id, _token: row.token, _success: success });
    if (success && !finishError) sent++;
  }
  return { sent };
}