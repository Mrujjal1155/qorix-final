import { afterEach, expect, test } from 'bun:test';
import { buyApi, buyWatchApi } from '../../src/lib/suppliers/buy-api.server';
import { supportsBuyWatch, buyWatchProductEligible } from '../../src/lib/supplier-buy-rules';
import { processBuyOrders } from '../../src/lib/suppliers/buy-orders.server';
import { runBuyWatchWindow } from '../../src/lib/suppliers/buy-watch.server';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const configured = [
  ['digitalcore', 'https://digitalcore.top'], ['mailreader', 'https://api.mailreader.tech/api/reseller'],
  ['canboso', 'https://canboso.com/api'], ['insightstore', 'https://api.insightxpro.store'],
  ['routeis', 'https://api.cmpdr.dev'], ['primelabs', 'https://prime-labs.tech/api/v1'],
  ['qamify', 'https://api.qamify.site'], ['vexoran', 'https://eismrrkygprctnwxmkbw.supabase.co/functions/v1/reseller-api'],
  ['vexorix', 'https://vexorixstore.shop'],
] as const;

function catalogue(key: string, stock: number) {
  if (key === 'digitalcore') return { id: '14', stock };
  if (key === 'insightstore') return { products: [{ id: 14, name: 'Fixture', base_price_usdt: 1, stock, available: stock > 0 }] };
  if (key === 'canboso') return { products: [{ productId: '14', name: 'Fixture', availability: { available: stock } }] };
  if (key === 'routeis') return { data: [{ id: 14, stock: { count: stock } }] };
  if (key === 'primelabs') return { products: [{ id: 14, stock: { type: 'limited', available: stock, in_stock: stock > 0 } }] };
  return { products: [{ id: '14', stock }] };
}
function delivery(key: string, count: number) {
  const items = Array.from({ length: count }, (_, i) => `FIXTURE-${i}`);
  if (key === 'digitalcore') return { success: true, order_id: '900', items };
  if (key === 'insightstore') return { order: { order_id: 900, product_id: 14, quantity: count, status: 'completed', codes: items } };
  if (key === 'canboso') return { order: { id: '900' }, delivery: { items } };
  if (key === 'routeis') return { orderCode: '900', lines: items };
  return { order: { id: '900', items } };
}
function fixture(key: string, base_url: string) {
  const supplier = { id: 's', key, base_url, name: 'Fixture', api_key: 'fixture-only' };
  const order: any = { id: 'o', supplier_id: 's', external_id: '14', target: 50, acquired: 0, status: 'watching', quantity_choices: [50, 40, 35] };
  const batches: any[] = [];
  const db: any = { from(table: string) {
    const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, update: () => q,
      maybeSingle: async () => ({ data: supplier }), then(resolve: any) {
        return Promise.resolve({ data: table === 'supplier_buy_orders' ? (order.status === 'watching' ? [order] : []) : [] }).then(resolve);
      } };
    return q;
  }, async rpc(name: string, p: any) {
    if (name === 'record_supplier_buy_check') return { data: order.status === 'watching' };
    if (name === 'claim_supplier_buy_batch') {
      if (order.status !== 'watching') return { data: null };
      batches.push({ id: 'batch-1', quantity: p.p_qty, status: 'submitted' }); order.status = 'purchasing'; return { data: 'batch-1' };
    }
    const batch = batches[0];
    if (!batch) throw new Error('Missing claimed batch');
    batch.status = p.p_status; batch.items = p.p_items; batch.supplier_order_id = p.p_supplier_order;
    order.acquired += p.p_items.length; order.status = p.p_status === 'completed' ? 'completed' : p.p_status === 'unknown' ? 'review' : 'paused';
    return { data: null };
  } };
  return { supplier, db, order, batches };
}

for (const [key, base] of configured) {
  test(`${key}: sold-out watch checks at 0/5s, buys 40 immediately on stock 45, saves delivery and never buys again`, async () => {
    expect(supportsBuyWatch(key, base)).toBe(true);
    const f = fixture(key, base), posts: { url: string; init: RequestInit; body: any; at: number }[] = [], reads: number[] = [];
    let time = 0;
    globalThis.fetch = (async (url: any, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        const body = JSON.parse(String(init.body)); posts.push({ url: String(url), init, body, at: time });
        return Response.json(delivery(key, Number(body.count ?? body.quantity ?? body.qty)));
      }
      reads.push(time); return Response.json(catalogue(key, time === 0 ? 0 : 45));
    }) as typeof fetch;
    const result = await runBuyWatchWindow(f.db, { windowMs: 15000, now: () => time, sleep: async ms => { time += ms; } });
    expect(result).toEqual({ ticks: 3, checks: 2, purchases: 1 });
    expect(reads).toEqual([0, 5000]); expect(posts).toHaveLength(1); expect(posts[0]?.at).toBe(5000);
    expect(posts[0]?.init.redirect).toBe('manual'); expect(posts[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(f.order.status).toBe('completed'); expect(f.order.acquired).toBe(40);
    expect(f.batches[0]?.supplier_order_id).toBe('900'); expect(f.batches[0]?.items).toHaveLength(40);
    const p = posts[0]; if (!p) throw new Error('Purchase missing');
    if (key !== 'digitalcore' && key !== 'canboso') {
      expect(p.body.idempotency_key ?? p.body.external_order_id ?? p.body.externalOrderId ?? new Headers(p.init.headers).get('Idempotency-Key')).toBe('qorix-buy-batch-1');
    }
  });

  test(`${key}: lost purchase response never sends another request on later ticks`, async () => {
    const f = fixture(key, base); let posts = 0;
    globalThis.fetch = (async (_url: any, init: RequestInit = {}) => {
      if (init.method === 'POST') { posts++; throw new Error('fixture lost response'); }
      return Response.json(catalogue(key, 50));
    }) as typeof fetch;
    await processBuyOrders(f.db); await processBuyOrders(f.db);
    expect(posts).toBe(1); expect(f.order.status).toBe('review'); expect(f.order.acquired).toBe(0);
  });
}

test('catalogue is shared within one tick but reread on the next tick', async () => {
  const f = fixture('qamify', 'https://api.qamify.site'); let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json(catalogue('qamify', 0)); }) as typeof fetch;
  const tick = buyWatchApi(); await tick(f.supplier, 'product?id=14'); await tick(f.supplier, 'product?id=14');
  expect(calls).toBe(1); await buyWatchApi()(f.supplier, 'product?id=14'); expect(calls).toBe(2);
});
test('manual/input-required products cannot trigger automatic buying', () => {
  for (const raw of [{ api_orderable: false }, { manual_delivery: true }, { purchaseRequirements: { customerEmail: true } }, { delivery_mode: 'manual' }, { stock: { type: 'activation' } }]) expect(buyWatchProductEligible(raw)).toBe(false);
  expect(buyWatchProductEligible({ stock: 0 })).toBe(true);
});
test('supplier key cannot send credentials to an unrelated host or insecure address', async () => {
  let calls = 0; globalThis.fetch = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  const s = fixture('qamify', 'https://untrusted.example').supplier;
  await expect(buyApi(s, 'buy', { id: '14', count: 40, reference: 'qorix-buy-fixture' })).rejects.toThrow();
  expect(calls).toBe(0);
  for (const url of ['http://api.qamify.site', 'https://api.qamify.site.evil.example', 'https://user:pass@api.qamify.site', 'https://api.qamify.site?key=x']) expect(supportsBuyWatch('qamify', url)).toBe(false);
});
test('Vexoran auth rejection cannot probe alternate headers or hosts for a purchase', async () => {
  let calls = 0; globalThis.fetch = (async () => { calls++; return Response.json({ error: 'forbidden' }, { status: 401 }); }) as typeof fetch;
  const s = fixture('vexoran', 'https://eismrrkygprctnwxmkbw.supabase.co/functions/v1/reseller-api').supplier;
  await expect(buyApi(s, 'buy', { id: '14', count: 40, reference: 'qorix-buy-fixture' })).rejects.toThrow(); expect(calls).toBe(1);
});
test('Insight failed/refunded buy watch cannot create a replacement purchase', async () => {
  let posts = 0; globalThis.fetch = (async (_url: any, init: RequestInit = {}) => {
    if (init.method === 'POST') posts++;
    return Response.json({ order: { order_id: 900, product_id: 14, quantity: 40, status: 'failed', amount_usdt: 40, codes: [] } });
  }) as typeof fetch;
  const s = fixture('insightstore', 'https://api.insightxpro.store').supplier;
  expect(await buyApi(s, 'buy', { id: '14', count: 40, reference: 'qorix-buy-fixture' })).toEqual({ order_id: '900', items: [] });
  expect(posts).toBe(1);
});
test('supplier minimum quantity prevents a smaller configured choice from buying', async () => {
  const f = fixture('qamify', 'https://api.qamify.site'); let posts = 0;
  await processBuyOrders(f.db, async (_s, path) => { if (path.startsWith('product')) return { id: '14', stock: 45, min_qty: 50 }; posts++; return {}; });
  expect(posts).toBe(0); expect(f.order.status).toBe('watching');
});
test('Insight accepted purchase retains its reference when delivery lookup fails', async () => {
  let posts = 0; globalThis.fetch = (async (_url: any, init: RequestInit = {}) => {
    if (init.method === 'POST') { posts++; return Response.json({ order: { order_id: 900, product_id: 14, quantity: 40, status: 'processing', codes: [] } }); }
    throw new Error('fixture lookup timeout');
  }) as typeof fetch;
  const s = fixture('insightstore', 'https://api.insightxpro.store').supplier;
  expect(await buyApi(s, 'buy', { id: '14', count: 40, reference: 'qorix-buy-fixture' })).toEqual({ order_id: '900', items: [] }); expect(posts).toBe(1);
});
test('partial supplier delivery is saved for review without another purchase', async () => {
  const f = fixture('qamify', 'https://api.qamify.site'); let posts = 0;
  globalThis.fetch = (async (_url: any, init: RequestInit = {}) => {
    if (init.method === 'POST') { posts++; return Response.json(delivery('qamify', 1)); }
    return Response.json(catalogue('qamify', 50));
  }) as typeof fetch;
  await processBuyOrders(f.db); await processBuyOrders(f.db);
  expect(posts).toBe(1); expect(f.order.status).toBe('review'); expect(f.batches[0]?.items).toEqual(['FIXTURE-0']); expect(f.batches[0]?.supplier_order_id).toBe('900');
});