import { supabaseAdmin as db } from '@/integrations/supabase/client.server';
import { websiteFulfillmentEligible, websitePaymentVerified } from './website-fulfillment';

export async function fulfillWebsiteOrder(orderId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: order, error } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error || !order || order.source !== 'website' || order.reseller_id) return { ok: false, reason: 'Order unavailable.' };
  if (order.status === 'completed') return { ok: true };
  if (!websiteFulfillmentEligible(order)) return { ok: false, reason: 'Confirm payment before delivery.' };
  const { data: claim, error: claimError } = await db.rpc('claim_website_fulfillment', { _order_id: orderId });
  if (claimError || !claim || typeof claim !== 'object' || Array.isArray(claim)) return { ok: false, reason: 'Delivery claim unavailable.' };
  if (claim['status'] === 'manual') return { ok: true };
  if (claim['status'] === 'inhouse') {
    const { retryInhouseDelivery } = await import('@/lib/inhouse-retry.server');
    return retryInhouseDelivery(orderId);
  }
  if (claim['status'] !== 'supplier' || typeof claim['token'] !== 'string')
    return { ok: false, reason: claim['status'] === 'review' ? 'Delivery already attempted; review the existing purchase before retrying.' : 'Delivery pending. Check available stock.' };
  const token = claim['token'];
  // Never remove the durable token: interrupted requests cannot buy this order again.
  let items: string[] = [];
  try {
    const { data: product } = await db.from('products').select('supplier_id,supplier_external_id,delivery_type').eq('id', order.product_id ?? '').maybeSingle();
    if (!product?.supplier_id || !product.supplier_external_id || product.delivery_type !== 'auto') throw new Error('Product unavailable');
    const { data: supplier } = await db.from('suppliers').select('*').eq('id', product.supplier_id).eq('is_enabled', true).maybeSingle();
    if (!supplier) throw new Error('Product unavailable');
    const { supplierOrder } = await import('@/lib/suppliers/api.server');
    // Manual products never reach this branch; no customer email is sent to a supplier.
    const result = await supplierOrder(supplier, product.supplier_external_id, order.quantity, `website-order-${orderId}`);
    items = result.items;
    const { data: finished, error: saveError } = await db.rpc('finish_website_fulfillment', { _order_id: orderId, _token: token, _items: items });
    if (saveError) throw new Error('Delivery received but could not be saved; review required (do not repurchase).');
    if (!finished || typeof finished !== 'object' || Array.isArray(finished) || finished['status'] !== 'completed')
      return { ok: false, reason: 'Incomplete delivery requires review.' };
    const { sendWebsiteOrderDelivery } = await import('@/lib/website-order-delivery.server');
    await sendWebsiteOrderDelivery(orderId).catch(() => false);
    return { ok: true };
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : 'Delivery needs review';
    await db.rpc('finish_website_fulfillment', { _order_id: orderId, _token: token, _items: items, _reason: reason.slice(0, 500) });
    console.error('[website-delivery] review required', orderId, reason);
    return { ok: false, reason: 'Payment confirmed; delivery needs admin review. No second purchase was made.' };
  }
}

/** Bounded recovery on the existing notification tick, not a new schedule. */
export async function recoverWebsiteFulfillment() {
  const started = Date.now();
  const { data: candidates } = await db.rpc('website_fulfillment_candidates', { _limit: 3 });
  let delivered = 0;
  for (const row of candidates ?? []) {
    if (Date.now() - started > 20_000) break;
    if ((await fulfillWebsiteOrder(row.id)).ok) delivered++;
  }
  const { data: pending } = await db.from('orders').select('id,txid,payment_method,meta').eq('source', 'website')
    .eq('status', 'pending').is('reseller_id', null).gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString())
    .order('created_at').limit(10);
  let checked = 0;
  for (const order of pending ?? []) {
    if (Date.now() - started > 20_000 || checked >= 3) break;
    if (websitePaymentVerified((order.meta ?? {}) as Record<string, any>) || !order.txid) continue;
    checked++;
    try {
      if (order.txid.startsWith('EPS-')) {
        const { settleEpsPayment } = await import('@/lib/eps-settle.server');
        await settleEpsPayment(order.txid.slice(4));
      } else if (order.payment_method === 'oxapay') {
        const meta = (order.meta ?? {}) as Record<string, any>;
        if (typeof meta['oxapay_track_id'] === 'string') {
          const { settleOxapay } = await import('@/lib/oxapay-settle.server');
          await settleOxapay(meta['oxapay_track_id']);
        }
      } else if (['binance', 'usdt_BSC', 'usdt_TRX', 'usdt_bep20', 'usdt_trc20', 'bybit', 'chain_trc20', 'chain_bep20'].includes(order.payment_method ?? '')) {
        const { verifyWebsiteOrderTxid } = await import('@/lib/website-binance-verify.server');
        await verifyWebsiteOrderTxid(order.id);
      }
    } catch { /* Retry provider reads, never a supplier purchase. */ }
  }
  return { checked, delivered };
}