import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { assertSupplierAdmin } from '@/lib/suppliers/admin-support';
import { buyItemsText, supportsBuyWatch } from './supplier-buy-rules';

export const listBuyOrders = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertSupplierAdmin(context);
  const sb = context.supabase as any;
  const [orders, suppliers, products] = await Promise.all([
    sb.from('supplier_buy_orders').select('*').order('created_at', { ascending: false }).limit(200),
    sb.from('suppliers').select('id,key,name,base_url,is_enabled').order('name'),
    sb.from('supplier_products').select('id,supplier_id,external_id,name,stock,min_qty').order('name').limit(1000),
  ]);
  if (orders.error || suppliers.error || products.error) throw new Error('Buy orders unavailable');
  const interval = Number(process.env['SUPPLIER_BUY_VERIFIED_INTERVAL_MS'] ?? 0);
  return { orders: orders.data ?? [], suppliers: (suppliers.data ?? []).map((s: any) => ({ id:s.id, name:s.name, enabled:s.is_enabled, supported:supportsBuyWatch(s.key,s.base_url) })), products: products.data ?? [], monitorReady: interval > 0 && interval < 5000, interval };
});

export const createBuyOrder = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid(), target: z.number().int().min(1).max(100000) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertSupplierAdmin(context);
    const sb = context.supabase as any;
    const { data:p } = await sb.from('supplier_products').select('id,supplier_id,external_id,name').eq('id',data.productId).maybeSingle();
    if (!p) throw new Error('Product unavailable');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await (supabaseAdmin as any).from('supplier_buy_orders').insert({ admin_id: context.userId, supplier_id:p.supplier_id, supplier_product_id:p.id, external_id:p.external_id, product_name:p.name, target:data.target, status:'paused' });
    if (error) throw new Error(error.code === '23505' ? 'An unfinished buy order already exists for this product' : 'Could not save buy order');
    return { ok:true };
  });

export const changeBuyOrder = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d:unknown) => z.object({ id:z.string().uuid(), action:z.enum(['resume','pause','cancel']) }).parse(d))
  .handler(async ({ context,data }) => {
    await assertSupplierAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const sb = supabaseAdmin as any;
    if (data.action==='resume') {
      const interval=Number(process.env['SUPPLIER_BUY_VERIFIED_INTERVAL_MS'] ?? 0);
      if (!(interval>0 && interval<5000)) throw new Error('Fast background monitoring is not configured; no purchase started');
      const { data:o } = await sb.from('supplier_buy_orders').select('supplier_id').eq('id',data.id).maybeSingle();
      const { data:s } = await sb.from('suppliers').select('key,base_url,is_enabled').eq('id',o?.supplier_id ?? '').maybeSingle();
      if (!s?.is_enabled || !supportsBuyWatch(s.key,s.base_url)) throw new Error('Automatic buying is not verified for this supplier');
      const { data:b } = await sb.from('supplier_buy_batches').select('id').eq('buy_order_id',data.id).in('status',['submitted','unknown']).limit(1);
      if (b?.length) throw new Error('Resolve the previous purchase before resuming');
    }
    const q = sb.from('supplier_buy_orders').update({status:data.action==='resume'?'watching':data.action==='pause'?'paused':'cancelled'}).eq('id',data.id);
    const { data:changed,error } = await (data.action==='resume'?q.eq('status','paused'):q.in('status',['watching','paused','purchasing'])).select('id');
    if (error || !changed?.length) throw new Error('Order state changed or needs review');
    return {ok:true};
  });

export const readBuyDelivery = createServerFn({method:'GET'}).middleware([requireSupabaseAuth])
  .inputValidator((d:unknown)=>z.object({id:z.string().uuid(),batchId:z.string().uuid().optional()}).parse(d))
  .handler(async ({context,data})=>{
    await assertSupplierAdmin(context);
    const sb=context.supabase as any;
    let q=sb.from('supplier_buy_batches').select('id,quantity,status,supplier_order_id,items,created_at,message').eq('buy_order_id',data.id).order('created_at');
    if(data.batchId) q=q.eq('id',data.batchId);
    const {data:batches,error}=await q;
    if(error) throw new Error('Delivery unavailable');
    return { batches:batches ?? [], text:buyItemsText(batches ?? []) };
  });