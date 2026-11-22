import { beforeAll, afterAll, test, expect } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const db = new PGlite();
const product = '11111111-1111-4111-8111-111111111111';
const supplier = '22222222-2222-4222-8222-222222222222';
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.role',true),'service_role') $$;
    CREATE TABLE suppliers(id uuid PRIMARY KEY,is_enabled boolean);
    CREATE TABLE products(id uuid PRIMARY KEY,supplier_id uuid,supplier_external_id text,delivery_type text);
    CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source text DEFAULT 'website',reseller_id uuid,status text DEFAULT 'pending',txid text,payment_method text,meta jsonb DEFAULT '{}',total numeric DEFAULT 0.8,quantity integer DEFAULT 1,product_id uuid,telegram_id bigint,delivered_content text,created_at timestamptz DEFAULT clock_timestamp(),updated_at timestamptz DEFAULT clock_timestamp());
    CREATE TABLE binance_used_txs(tx_id text PRIMARY KEY);
    CREATE TABLE stock_counters(product_id uuid PRIMARY KEY,available integer);
    CREATE FUNCTION take_manual_stock(_pid uuid,_qty integer) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN UPDATE stock_counters SET available=available-_qty WHERE product_id=_pid AND available>=_qty; RETURN FOUND; END $$;
    INSERT INTO suppliers VALUES('${supplier}',true);
    INSERT INTO products VALUES('${product}','${supplier}','supplier-product','auto');
    INSERT INTO stock_counters VALUES('${product}',10);`);
  const paidDefinition = (await readFile(new URL('../../supabase/migrations/20261113081533_ff6308e5-3f7d-485b-b27d-598b0b9624de.sql', import.meta.url), 'utf8')).split('\n').find(line => line.startsWith('CREATE OR REPLACE FUNCTION public.payment_order_is_paid'));
  if (!paidDefinition) throw new Error('Missing payment definition');
  await db.exec(paidDefinition);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261122082044_e431394a-4645-4de0-ba90-3ac3ce37f626.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261122082434_3f8ae319-5a59-4644-af82-1de7de38cea3.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261122082705_4168c08d-c6e2-46f7-9e1b-fc8aedd66d7b.sql', import.meta.url), 'utf8'));
}, 30000);
afterAll(() => db.close());
async function make(method = 'binance', txid = crypto.randomUUID(), meta: Record<string, unknown> = {}) {
  const row = (await db.query<{ id: string }>('insert into orders(product_id,payment_method,txid,meta) values($1,$2,$3,$4) returning id', [product, method, txid, JSON.stringify(meta)])).rows[0];
  if (!row) throw new Error('Order missing');
  return { id: row.id, txid };
}
async function settle(o: { id: string; txid: string }, gateway = 'binance', amount = 0.8, secondary: string | null = null) {
  return (await db.query<{ r: any }>('select settle_verified_website_payment($1,$2,$3,$4,$5) r', [o.id, gateway, amount, gateway === 'eps' ? o.txid.slice(4) : o.txid, secondary])).rows[0]?.r;
}
async function claim(id: string) { return (await db.query<{ r: any }>('select claim_website_fulfillment($1) r', [id])).rows[0]?.r; }
async function finish(id: string, token: string | null, items: unknown, reason: string | null = null) {
  return (await db.query<{ r: any }>('select finish_website_fulfillment($1,$2,$3,$4) r', [id, token, JSON.stringify(items), reason])).rows[0]?.r;
}
test('0.80 USDT pays once and returns one supplier claim; completion is idempotent', async () => {
  const o = await make();
  expect((await settle(o)).changed).toBe(true);
  expect((await settle(o)).changed).toBe(false);
  const first = await claim(o.id);
  expect(first.status).toBe('supplier');
  expect((await claim(o.id)).status).toBe('review');
  expect((await finish(o.id, first.token, ['account-one'])).status).toBe('completed');
  expect((await finish(o.id, first.token, ['wrong-second-account'])).changed).toBe(false);
  const row = (await db.query<{ delivered_content: string }>('select delivered_content from orders where id=$1', [o.id])).rows[0];
  expect(row?.delivered_content).toBe('account-one');
});
test('wrong amount, unpaid and already-used payments cannot claim delivery', async () => {
  const o = await make();
  await expect(settle(o, 'binance', 0.79)).rejects.toThrow('Invalid Binance');
  expect((await claim(o.id)).status).toBe('ineligible');
  await db.query('insert into binance_used_txs values($1)', [o.txid]);
  await expect(settle(o)).rejects.toThrow();
  expect((await claim(o.id)).status).toBe('ineligible');
});
test('30-minute expiry rejects new settlement but timely verified legacy payment can deliver', async () => {
  const expired = await make();
  await db.query("update orders set created_at=clock_timestamp()-interval '31 minutes' where id=$1", [expired.id]);
  await expect(settle(expired)).rejects.toThrow('expired');
  const legacy = await make('binance', 'legacy-verified', { binance: { status: 'verified', amount: 0.8, currency: 'USDT' } });
  await db.query("update orders set created_at=clock_timestamp()-interval '1 day' where id=$1", [legacy.id]);
  expect((await claim(legacy.id)).status).toBe('supplier');
});
test('EPS second transaction conflict rolls back the first key and paid status', async () => {
  const o = await make('eps', `EPS-${crypto.randomUUID()}`, { bdt: 100 });
  await db.exec("insert into binance_used_txs values('eps-tx:already-used')");
  await expect(settle(o, 'eps', 100, 'already-used')).rejects.toThrow();
  const keys = await db.query('select tx_id from binance_used_txs where tx_id=$1', [`eps:${o.txid.slice(4)}`]);
  expect(keys.rows.length).toBe(0);
  expect((await claim(o.id)).status).toBe('ineligible');
});
test('EPS and OxaPay settle once with provider-bound references', async () => {
  const eps = await make('eps', `EPS-${crypto.randomUUID()}`, { bdt: 100 });
  expect((await settle(eps, 'eps', 100, 'unique-provider-tx')).changed).toBe(true);
  expect((await settle(eps, 'eps', 100, 'unique-provider-tx')).changed).toBe(false);
  const ref = crypto.randomUUID();
  const oxa = await make('oxapay', ref, { oxapay_track_id: ref });
  expect((await settle(oxa, 'oxapay')).changed).toBe(true);
  expect((await settle(oxa, 'oxapay')).changed).toBe(false);
});
for (const method of ['usdt_bep20', 'usdt_trc20', 'usdt_BSC', 'usdt_TRX']) {
  test(`${method} uses exact 0.80 USDT atomic settlement`, async () => {
    const o = await make(method);
    expect((await settle(o)).changed).toBe(true);
    expect((await claim(o.id)).status).toBe('supplier');
  });
}
test('partial or uncertain delivery remains review and never obtains a second buy token', async () => {
  const o = await make('binance', crypto.randomUUID(), { paid: true });
  await db.query('update orders set quantity=2 where id=$1', [o.id]);
  const c = await claim(o.id);
  expect((await finish(o.id, c.token, ['one-account'])).status).toBe('review');
  expect((await claim(o.id)).status).toBe('review');
  expect((await finish(o.id, c.token, ['one', 'two'])).status).toBe('ineligible');
});
test('refund after claim and wrong token cannot complete delivery', async () => {
  const o = await make('binance', crypto.randomUUID(), { paid: true });
  const c = await claim(o.id);
  expect((await finish(o.id, crypto.randomUUID(), ['account'])).status).toBe('ineligible');
  await db.query("update orders set meta=meta||'{\"refunded\":true}' where id=$1", [o.id]);
  expect((await finish(o.id, c.token, ['account'])).status).toBe('ineligible');
});
test('a missing claim token never completes an unclaimed paid order', async () => {
  const o = await make('binance', crypto.randomUUID(), { paid: true });
  expect((await finish(o.id, null, ['account'])).status).toBe('ineligible');
  expect((await db.query<{ status: string }>('select status from orders where id=$1', [o.id])).rows[0]?.status).toBe('pending');
});
test('manual products reserve stock once without supplier purchase or automatic completion', async () => {
  await db.query("update products set delivery_type='manual' where id=$1", [product]);
  const o = await make('binance', crypto.randomUUID(), { paid: true });
  expect((await claim(o.id)).status).toBe('manual');
  expect((await claim(o.id)).status).toBe('manual');
  expect((await db.query<{ available: number }>('select available from stock_counters where product_id=$1', [product])).rows[0]?.available).toBe(9);
  expect((await db.query<{ status: string }>('select status from orders where id=$1', [o.id])).rows[0]?.status).toBe('pending');
  const candidates = (await db.query<{ id: string }>('select * from website_fulfillment_candidates(10)')).rows;
  expect(candidates.some(row => row.id === o.id)).toBe(false);
  await db.query("update products set delivery_type='auto' where id=$1", [product]);
});
test('service-only RPCs deny public and signed-in clients', async () => {
  for (const role of ['anon', 'authenticated']) {
    const rows = (await db.query<{ allowed: boolean }>("select has_function_privilege($1, 'public.claim_website_fulfillment(uuid)', 'EXECUTE') allowed", [role])).rows;
    expect(rows[0]?.allowed).toBe(false);
  }
  await db.exec("set test.role='authenticated'");
  await expect(claim(crypto.randomUUID())).rejects.toThrow('Forbidden');
  await db.exec("set test.role='service_role'");
});