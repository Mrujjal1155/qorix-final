import { beforeEach, expect, mock, test } from 'bun:test';
let order: any;
let purchases = 0;
let privateReceipts = 0;
let settlements = 0;
let supplierOutcome: 'complete' | 'partial' | 'unknown' = 'complete';
let matched = true;
let amount = 0.8;
let failSettlement = false;
let failSave = false;
const token = '11111111-1111-4111-8111-111111111111';
mock.module('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from(table: string) {
    let patch: any;
    const query: any = {
      select: () => query, eq: () => query, in: () => query, is: () => query,
      update: (p: any) => { patch = p; return query; },
      maybeSingle: async () => ({ data: table === 'orders' ? structuredClone(order) : table === 'products' ? {
        supplier_id: 'supplier', supplier_external_id: '46', delivery_type: 'auto',
      } : { id: 'supplier', is_enabled: true }, error: null }),
      then: (resolve: any) => { if (patch && !order.meta.paid) order = { ...order, ...patch }; return Promise.resolve({ data: [], error: null }).then(resolve); },
    }; return query;
  },
  async rpc(name: string, args: any) {
    if (name.startsWith('record_')) return { data: null, error: null };
    if (name.startsWith('settle_')) {
      if (failSettlement) return { data: null, error: { message: 'duplicate transaction' } };
      settlements++;
      order.meta = { ...order.meta, paid: true, awaiting_payment: false };
      if (args._gateway === 'eps') order.meta.eps_paid = true;
      if (args._gateway === 'oxapay') order.meta.oxapay_paid = true;
      if (args._gateway === 'binance') order.meta.binance = { status: 'verified', amount: args._amount, currency: 'USDT' };
      return { data: { changed: true, status: 'ready' }, error: null };
    }
    if (name === 'claim_website_fulfillment') {
      if (order.meta.website_supplier_attempt) return { data: { status: 'review' }, error: null };
      order.meta.website_supplier_attempt = token;
      order.meta.website_supplier_state = 'processing';
      order.meta.paid = true;
      return { data: { status: 'supplier', token }, error: null };
    }
    if (name === 'finish_website_fulfillment') {
      if (failSave) return { data: null, error: { message: 'save interrupted' } };
      if (args._reason || args._items.length !== order.quantity) {
        order.meta.website_supplier_state = 'review';
        return { data: { status: 'review' }, error: null };
      }
      order.status = 'completed'; order.delivered_content = args._items.join('\n---\n');
      return { data: { status: 'completed', changed: true }, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  },
} }));
mock.module('@/lib/suppliers/api.server', () => ({ supplierOrder: async (_supplier: unknown, _product: string, quantity: number, ref: string, opts?: unknown) => {
  purchases++;
  expect(quantity).toBe(order.quantity);
  expect(ref).toBe(`website-order-${order.id}`);
  expect(opts).toBeUndefined();
  if (supplierOutcome === 'unknown') throw new Error('Response lost');
  return { items: supplierOutcome === 'partial' ? [] : ['account\npassword'] };
} }));
mock.module('@/lib/website-order-delivery.server', () => ({ sendWebsiteOrderDelivery: async () => { privateReceipts++; return true; } }));
mock.module('@/lib/binance.server', () => ({ findByTxId: async () => matched ? { ok: true, amount, currency: 'USDT' } : { ok: false } }));
mock.module('@/lib/bybit.server', () => ({ findBybitPayment: async () => matched ? { ok: true, amount, txid: order.txid } : { ok: false, reason: 'not found' } }));
mock.module('@/lib/blockchain.server', () => ({ findChainPayment: async () => matched ? { ok: true, amount: String(amount), txid: order.txid } : { ok: false, reason: 'not found' } }));
mock.module('@/lib/eps.server', () => ({ epsConfig: () => ({ rate: 125 }), usdToBdt: () => 100, isPaid: (s: string) => s === 'Success', verifyTransaction: async () => ({ ok: true, info: { status: matched ? 'Success' : 'Pending', amount: 100, epsTransactionId: 'eps-provider-1', financialEntity: 'bKash' } }) }));
mock.module('@/lib/oxapay.server', () => ({ oxapayKey: () => 'fixture', oxapayPaymentInfo: async () => ({ ok: true, info: {
  orderId: `W-${order.id}`, trackId: 'oxa-fixture', status: matched ? 'paid' : 'pending', currency: 'USD', amount, coin: 'USDT', txHash: 'fixture-hash',
} }) }));
mock.module('@/lib/email/resend.server', () => ({ sendResendEmail: async () => {}, getEmailBrand: async () => ({ logoUrl: '' }) }));
mock.module('@/lib/order-access.server', () => ({ orderAccessToken: () => 'fixture' }));
const { verifyWebsiteOrderTxid } = await import('../../src/lib/website-binance-verify.server');
const { settleEpsPayment } = await import('../../src/lib/eps-settle.server');
const { settleOxapay } = await import('../../src/lib/oxapay-settle.server');
const { fulfillWebsiteOrder } = await import('../../src/lib/website-fulfillment.server');
beforeEach(() => {
  order = { id: 'fixture-order', order_no: 1042, source: 'website', status: 'pending', payment_method: 'binance', txid: 'fixture-tx', quantity: 1, total: 0.8, telegram_id: 123, product_id: 'product', product_name: 'Fixture', delivery_type: 'auto', created_at: new Date().toISOString(), delivered_content: null, meta: {} };
  purchases = 0; privateReceipts = 0; settlements = 0; supplierOutcome = 'complete'; matched = true; amount = 0.8; failSettlement = false; failSave = false;
});
for (const gateway of ['binance', 'usdt_bep20', 'usdt_trc20', 'bybit', 'chain_bep20', 'chain_trc20', 'eps', 'oxapay']) {
  test(`${gateway}: verified payment immediately saves full delivery and queues connected Telegram receipt`, async () => {
    order.payment_method = gateway;
    if (gateway === 'eps') { order.txid = 'EPS-eps-fixture'; order.meta.bdt = 100; }
    if (gateway === 'oxapay') order.meta.oxapay_track_id = 'oxa-fixture';
    const verify = () => gateway === 'eps' ? settleEpsPayment('eps-fixture') : gateway === 'oxapay' ? settleOxapay('oxa-fixture') : verifyWebsiteOrderTxid(order.id);
    await verify();
    expect(order.status).toBe('completed');
    expect(order.delivered_content).toBe('account\npassword');
    expect(order.meta.paid).toBe(true);
    expect(purchases).toBe(1); expect(privateReceipts).toBe(1);
    await verify(); await fulfillWebsiteOrder(order.id);
    expect(purchases).toBe(1); expect(privateReceipts).toBe(1);
  });
}
test('provider pending and wrong amount never purchase or complete', async () => {
  matched = false; await verifyWebsiteOrderTxid(order.id);
  expect(purchases).toBe(0); expect(order.status).toBe('pending');
  matched = true; amount = 0.79; await verifyWebsiteOrderTxid(order.id);
  expect(purchases).toBe(0); expect(order.status).toBe('pending');
});
test('failed atomic payment settlement never purchases delivery', async () => {
  failSettlement = true; await verifyWebsiteOrderTxid(order.id);
  expect(purchases).toBe(0); expect(privateReceipts).toBe(0);
});
for (const outcome of ['partial', 'unknown'] as const) {
  test(`${outcome} supplier response stays paid for review without another purchase`, async () => {
    supplierOutcome = outcome;
    await verifyWebsiteOrderTxid(order.id); await fulfillWebsiteOrder(order.id);
    expect(order.status).toBe('pending'); expect(order.meta.paid).toBe(true);
    expect(order.meta.website_supplier_state).toBe('review'); expect(purchases).toBe(1); expect(privateReceipts).toBe(0);
  });
}
test('save interruption retains the permanent purchase claim', async () => {
  failSave = true;
  await verifyWebsiteOrderTxid(order.id); await fulfillWebsiteOrder(order.id);
  expect(purchases).toBe(1); expect(order.status).toBe('pending'); expect(privateReceipts).toBe(0);
});
test('concurrent verification shares one supplier claim and never buys twice', async () => {
  await Promise.all([verifyWebsiteOrderTxid(order.id), verifyWebsiteOrderTxid(order.id)]);
  expect(purchases).toBe(1); expect(order.status).toBe('completed');
});