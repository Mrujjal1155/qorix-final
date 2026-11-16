import { buyBatchQuantity, buyOutcome, supportsBuyWatch, chooseBuyQuantity } from '../supplier-buy-rules';
import { buyApi, BuyRejected } from './buy-api.server';

export async function processBuyOrders(db: any, request: typeof buyApi = buyApi) {
  const { data: orders, error } = await db.from('supplier_buy_orders').select('*').eq('status', 'watching').order('created_at').limit(50);
  if (error) throw new Error('Buy orders unavailable');
  let checks = 0, purchases = 0;
  // Sequential processing keeps the outbound connection budget bounded.
  for (const o of orders ?? []) {
    const { data: s } = await db.from('suppliers').select('*').eq('id', o.supplier_id).eq('is_enabled', true).maybeSingle();
    if (!s || !supportsBuyWatch(s.key, s.base_url)) continue;
    let product: any;
    try { product = await request(s, `product?id=${encodeURIComponent(o.external_id)}`); }
    catch { await db.from('supplier_buy_orders').update({ message: 'Stock check unavailable; no purchase sent', last_checked_at: new Date().toISOString() }).eq('id', o.id).eq('status','watching'); continue; }
    checks++;
    const stock = Number(product.stock);
    if (!Number.isSafeInteger(stock) || stock < 0 || String(product.id) !== o.external_id) continue;
    const { data: rejected, error: rejectedError } = await db.from('supplier_buy_batches').select('quantity').eq('buy_order_id',o.id).eq('status','rejected');
    if (rejectedError) continue;
    const choices = o.quantity_choices ? chooseBuyQuantity(stock, o.quantity_choices, (rejected ?? []).map((b:any)=>b.quantity)) : {quantity:buyBatchQuantity(stock,o.target-o.acquired),checked:[]};
    const { data: recorded, error: recordError } = await db.rpc('record_supplier_buy_check',{p_order:o.id,p_stock:stock,p_choices:choices.checked});
    if (recordError || !recorded) continue;
    let qty = choices.quantity;
    if (!qty) continue;
    while (qty) {
    const { data: batch, error: claimError } = await db.rpc('claim_supplier_buy_batch', { p_order: o.id, p_qty: qty });
    if (claimError || !batch) break;
    purchases++;
    let status: string = 'unknown', items: string[] = [], supplierOrder: string | null = null, message = 'Purchase outcome uncertain; do not retry';
    try {
      const result = await request(s, 'buy', { id: o.external_id, count: qty });
      supplierOrder = typeof result.order_id === 'string' ? result.order_id : null;
      if (Array.isArray(result.items) && result.items.every((x: unknown) => typeof x === 'string')) items = result.items;
      status = buyOutcome(items, qty);
      message = status === 'completed' ? '' : 'Delivery count needs reconciliation';
    } catch (e) {
      if (e instanceof BuyRejected) { status = 'rejected'; message = e.message; }
    }
    // If saving fails, leave the submitted batch permanently unresolved; never POST again.
    const { error: saveError } = await db.rpc('finish_supplier_buy_batch', { p_batch: batch, p_status: status, p_items: items, p_supplier_order: supplierOrder, p_message: message });
    if (saveError) throw new Error('Purchase needs reconciliation; automatic retry blocked');
    if (!(o.quantity_choices && status==='rejected' && message==='OUT_OF_STOCK')) break;
    qty = chooseBuyQuantity(stock,o.quantity_choices,[qty]).quantity;
    }
  }
  return { checks, purchases };
}