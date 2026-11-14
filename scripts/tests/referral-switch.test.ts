import { test, expect, beforeAll, afterAll } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { referralMode, referralCallbackAllowed } from '../../src/lib/referral-mode';

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role' $$;
    CREATE TABLE test_admin(allowed boolean); INSERT INTO test_admin VALUES(true);
    CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT allowed FROM test_admin $$;
    CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    CREATE TABLE bot_settings(key text PRIMARY KEY,value text,updated_at timestamptz DEFAULT now());
    CREATE TABLE products(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true,supplier_id uuid,owner_reseller_id uuid,delivery_type text DEFAULT 'auto');
    CREATE TABLE bot_users(telegram_id bigint PRIMARY KEY,is_banned boolean DEFAULT false,balance numeric DEFAULT 0,referral_earnings numeric DEFAULT 0,referred_by bigint);
    CREATE TABLE profiles(id uuid PRIMARY KEY,full_name text,email text,wallet_balance numeric DEFAULT 0,referral_earnings numeric DEFAULT 0,referred_by uuid,is_banned boolean DEFAULT false,telegram_id bigint);
    CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_no bigint,telegram_id bigint,product_name text,quantity integer DEFAULT 1,total numeric,status text,source text DEFAULT 'bot',user_id uuid,customer_email text,meta jsonb DEFAULT '{}',referral_credited boolean DEFAULT false);
    CREATE TABLE referral_commissions(id uuid DEFAULT gen_random_uuid(),order_id uuid UNIQUE,order_no bigint,channel text,referrer_user_id uuid,referrer_telegram_id bigint,buyer_user_id uuid,buyer_telegram_id bigint,percent numeric,amount numeric,reversed_amount numeric,status text,reason text,created_at timestamptz DEFAULT now(),reversed_at timestamptz);
    CREATE TABLE wallet_transactions(user_id uuid,type text,amount numeric,balance_after numeric,reference text,note text);
    CREATE TABLE transactions(telegram_id bigint,type text,amount numeric,method text,reference text,note text);
    CREATE FUNCTION referral_setting(text,text) RETURNS text LANGUAGE sql AS $$ SELECT COALESCE((SELECT value FROM bot_settings WHERE key=$1),$2) $$;
    CREATE TABLE referral_credits(telegram_id bigint PRIMARY KEY,earned numeric DEFAULT 0,spent numeric DEFAULT 0,updated_at timestamptz DEFAULT now());
    CREATE TABLE referral_credit_events(id uuid DEFAULT gen_random_uuid(),inviter_telegram_id bigint,invitee_telegram_id bigint UNIQUE,credits numeric,status text DEFAULT 'pending',awarded_on date,created_at timestamptz DEFAULT now());
    CREATE TABLE referral_credit_purchases(telegram_id bigint,name text,credits numeric,created_at timestamptz DEFAULT now());
    CREATE TABLE stock_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid,content text,is_sold boolean DEFAULT false,sold_to bigint,sold_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE FUNCTION referral_credit_award(_inviter bigint,_invitee bigint,_credits numeric,_cap integer) RETURNS numeric LANGUAGE plpgsql AS $$ BEGIN INSERT INTO referral_credit_events(inviter_telegram_id,invitee_telegram_id,credits) VALUES(_inviter,_invitee,_credits) ON CONFLICT(invitee_telegram_id) DO NOTHING; RETURN referral_credit_flush(_inviter,_cap); END $$;
    CREATE FUNCTION referral_credit_flush(bigint,integer) RETURNS numeric LANGUAGE plpgsql AS $$ BEGIN RETURN 0; END $$;
    CREATE FUNCTION referral_credit_spend(bigint,numeric,text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RETURN true; END $$;
  `);
  for (const file of ['20261114195845_30dd0106-bdad-4f86-b403-945a4f62b30a.sql','20261114200810_c8f8dda1-0654-4e73-a208-8c133f86cce1.sql','20261114200834_700b4baa-29bc-4d56-8f00-2fa35b8b33ce.sql','20261114200857_bc582aec-52e9-405b-a037-9ed966aacfd6.sql']) await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url),'utf8'));
  await db.exec(`INSERT INTO bot_users(telegram_id,referred_by) VALUES(100,NULL),(101,100);
    INSERT INTO referral_credits VALUES(100,20,0,now());
    INSERT INTO products(id,name) VALUES('00000000-0000-0000-0000-000000000010','Test Reward');
    INSERT INTO referral_product_rewards(id,product_id,credits) VALUES('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000010',10);
    INSERT INTO stock_items(product_id,content) VALUES('00000000-0000-0000-0000-000000000010','original\\ncredential');`);
}, 30000);
afterAll(() => db.close());
async function mode(value: string) { await db.query(`UPDATE bot_settings SET value=$1 WHERE key='referral_mode'`,[value]); }
async function result(sql: string) { return (await db.query<any>(sql)).rows[0]?.r; }
test('one mode only; both off blocks every referral callback including cash redemption', () => {
  expect(referralMode('points')).toBe('points'); expect(referralMode('commission')).toBe('commission'); expect(referralMode('both')).toBe('off');
  for (const c of ['refstore','refearn','refbought','refcash','refbuy:x','ref:list','refcomm:0']) expect(referralCallbackAllowed('off',c)).toBe(false);
  expect(referralCallbackAllowed('points','refcomm:0')).toBe(false); expect(referralCallbackAllowed('commission','refbuy:x')).toBe(false);
});
test('initially off: no commission, no points, no request, no legacy spend', async () => {
  expect(await result(`SELECT current_referral_mode() r`)).toBe('off');
  expect(await result(`SELECT referral_credit_award(100,101,1,10) r`)).toBe('0');
  expect((await result(`SELECT request_referral_reward(100,'00000000-0000-0000-0000-000000000020') r`)).reason).toBe('disabled');
  expect(await result(`SELECT referral_credit_spend(100,10,'legacy') r`)).toBe(false);
});
test('points request reserves ten once, approval requires admin, shortage preserves request, rejection refunds ten', async () => {
  await mode('points');
  const first = await result(`SELECT request_referral_reward(100,'00000000-0000-0000-0000-000000000020') r`);
  const twice = await result(`SELECT request_referral_reward(100,'00000000-0000-0000-0000-000000000020') r`);
  expect(first.ok).toBe(true); expect(twice.id).toBe(first.id);
  expect(await result(`SELECT spent::int r FROM referral_credits WHERE telegram_id=100`)).toBe(10);
  await db.exec('UPDATE test_admin SET allowed=false');
  await expect(db.query(`SELECT review_referral_reward($1,true)`,[first.id])).rejects.toThrow('Forbidden');
  await db.exec('UPDATE test_admin SET allowed=true; UPDATE stock_items SET is_sold=true');
  const shortage=await result(`SELECT review_referral_reward('${first.id}',true) r`); expect(shortage.reason).toBe('stock');
  expect(await result(`SELECT status r FROM referral_reward_requests WHERE id='${first.id}'`)).toBe('pending');
  await mode('off'); expect((await result(`SELECT review_referral_reward('${first.id}',true) r`)).reason).toBe('disabled');
  expect((await result(`SELECT review_referral_reward('${first.id}',false) r`)).status).toBe('rejected');
  await result(`SELECT review_referral_reward('${first.id}',false) r`);
  expect(await result(`SELECT spent::int r FROM referral_credits WHERE telegram_id=100`)).toBe(0);
  await db.exec('UPDATE stock_items SET is_sold=false');
});
test('approval claims one stock once and lease retries the same saved credential without charging again',async () => {
  await mode('points');
  const req=await result(`SELECT request_referral_reward(100,'00000000-0000-0000-0000-000000000020') r`);
  expect((await result(`SELECT review_referral_reward('${req.id}',true) r`)).status).toBe('approved');
  expect((await result(`SELECT review_referral_reward('${req.id}',true) r`)).duplicate).toBe(true);
  expect(await result(`SELECT count(*)::int r FROM stock_items WHERE is_sold`)).toBe(1);
  const claim=await result('SELECT claim_referral_deliveries() r'); expect(claim.id).toBe(req.id);
  expect((await db.query('SELECT claim_referral_deliveries()')).rows.length).toBe(0);
  expect(await result(`SELECT finish_referral_delivery('${req.id}',gen_random_uuid(),true) r`)).toBe(false);
  await result(`SELECT finish_referral_delivery('${req.id}','${claim.token}',false) r`);
  await db.exec('UPDATE referral_reward_deliveries SET next_attempt_at=now()');
  const retry=await result('SELECT claim_referral_deliveries() r'); expect(retry.content).toBe(claim.content);
  await result(`SELECT finish_referral_delivery('${req.id}','${retry.token}',true) r`);
  expect(await result(`SELECT status r FROM referral_reward_requests WHERE id='${req.id}'`)).toBe('delivered');
  expect(await result(`SELECT spent::int r FROM referral_credits WHERE telegram_id=100`)).toBe(10);
});
test('commission remains off for orders completed while off even after model changes; new commission is 5% of profit',async () => {
  await mode('off');
  await db.exec(`INSERT INTO orders(id,order_no,telegram_id,total,status,product_name,meta) VALUES('00000000-0000-0000-0000-000000000030',1,101,40,'completed','Product','{"unit_cost":35}')`);
  expect((await result(`SELECT referral_award('00000000-0000-0000-0000-000000000030') r`)).reason).toBe('disabled');
  await mode('commission');
  expect((await result(`SELECT referral_award('00000000-0000-0000-0000-000000000030') r`)).reason).toBe('disabled');
  await db.exec(`INSERT INTO orders(id,order_no,telegram_id,total,status,product_name,meta) VALUES('00000000-0000-0000-0000-000000000031',2,101,40,'completed','Product','{"unit_cost":35}')`);
  const award=await result(`SELECT referral_award('00000000-0000-0000-0000-000000000031') r`);
  expect(award.profit).toBe(5); expect(award.amount).toBe(0.25);
  expect(await result(`SELECT referral_credit_award(100,101,1,10) r`)).toBe('0');
});
test('non-admin cannot read requests or call stock/point mutations directly',async () => {
  await db.exec('UPDATE test_admin SET allowed=false; SET ROLE authenticated');
  expect((await db.query('SELECT * FROM referral_reward_requests')).rows.length).toBe(0);
  await expect(db.query('SELECT * FROM referral_reward_deliveries')).rejects.toThrow();
  await expect(db.query(`SELECT request_referral_reward(100,'00000000-0000-0000-0000-000000000020')`)).rejects.toThrow();
  await db.exec('RESET ROLE; UPDATE test_admin SET allowed=true');
});