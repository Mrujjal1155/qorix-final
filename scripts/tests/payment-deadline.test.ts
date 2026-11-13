import { beforeAll, afterAll, test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { paymentAttemptOpen, PAYMENT_WINDOW_MS } from "../../src/lib/payment-deadline";
import { reconciliationState } from "../../src/lib/payment-reconciliation";
const db = new PGlite();
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role' $$;
 CREATE TABLE binance_deposits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text,telegram_id bigint DEFAULT 123,amount_usdt numeric DEFAULT 10,status text DEFAULT 'pending',tx_id text,meta jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '2 hours');
 CREATE TABLE binance_used_txs(tx_id text PRIMARY KEY);
 CREATE TABLE historical_payment_txid_blocks(transaction_key text PRIMARY KEY,gateway text,cutoff_at timestamptz,reason text);
 CREATE TABLE orders(id uuid DEFAULT gen_random_uuid(),source text,status text,meta jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),payment_method text,txid text);
 CREATE TABLE transactions(type text,reference text);
 CREATE TABLE reseller_transactions(type text,reference text);
 CREATE TABLE payment_requests(status text,admin_note text,created_at timestamptz DEFAULT now());`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261113081533_ff6308e5-3f7d-485b-b27d-598b0b9624de.sql',import.meta.url),'utf8'));
 await db.exec(`CREATE FUNCTION guard_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM historical_payment_txid_blocks WHERE lower(transaction_key)=lower(NEW.tx_id)) THEN RAISE EXCEPTION 'already used'; END IF; RETURN NEW; END $$; CREATE TRIGGER history BEFORE INSERT ON binance_used_txs FOR EACH ROW EXECUTE FUNCTION guard_history();`);
},30000);
afterAll(async()=>db.close());
test('maximum open time is exactly 30 minutes, not two hours',()=>{
 const created='2026-11-13T08:00:00Z'; const row={status:'pending',created_at:created,expires_at:'2026-11-13T10:00:00Z'};
 expect(PAYMENT_WINDOW_MS).toBe(1800000);
 expect(paymentAttemptOpen(row,Date.parse(created)+1799999)).toBe(true);
 expect(paymentAttemptOpen(row,Date.parse(created)+1800000)).toBe(false);
 expect(paymentAttemptOpen({...row,status:'expired'},Date.parse(created)+1)).toBe(false);
});
test('all gateway deposits are capped at 30 minutes and TXID updates cannot extend them',async()=>{
 for(const kind of ['payid','bybit','chain_bep20','chain_trc20','crypto','eps','oxapay','paykori']){
 const row=(await db.query<any>(`INSERT INTO binance_deposits(kind) VALUES($1) RETURNING id,extract(epoch from expires_at-created_at)::int seconds`,[kind])).rows[0];
 expect(row?.seconds).toBe(1800);
 await db.query(`UPDATE binance_deposits SET tx_id='newId',expires_at=now()+interval '4 hours' WHERE id=$1`,[row.id]);
 expect((await db.query<any>(`SELECT extract(epoch from expires_at-created_at)::int seconds FROM binance_deposits WHERE id=$1`,[row.id])).rows[0]?.seconds).toBe(1800);
 }
});
test('expiry includes ID-less attempts and reserves submitted IDs without crediting',async()=>{
 await db.exec(`INSERT INTO binance_deposits(kind,created_at,expires_at,tx_id) VALUES('bybit',now()-interval '31 minutes',now()+interval '1 hour','OLDTRANSFER'),('chain_bep20',now()-interval '31 minutes',now()+interval '1 hour',NULL); SELECT expire_payment_attempts();`);
 expect((await db.query<any>(`SELECT count(*)::int n FROM binance_deposits WHERE created_at<now()-interval '30 minutes' AND status='pending'`)).rows[0]?.n).toBe(0);
 expect((await db.query<any>(`SELECT count(*)::int n FROM historical_payment_txid_blocks WHERE transaction_key='bybit:OLDTRANSFER'`)).rows[0]?.n).toBe(1);
 await expect(db.exec(`INSERT INTO binance_used_txs VALUES('bybit:OLDTRANSFER')`)).rejects.toThrow('already used');
 await expect(db.exec(`INSERT INTO transactions VALUES('deposit','OLDTRANSFER')`)).rejects.toThrow('cannot credit again');
 await expect(db.exec(`INSERT INTO reseller_transactions VALUES('topup','OLDTRANSFER')`)).rejects.toThrow('cannot credit again');
 expect((await db.query<any>('SELECT count(*)::int n FROM transactions')).rows[0]?.n).toBe(0);
 expect(reconciliationState({status:'expired',tx_id:null},false)).toBe('expired');
});
test('expired automatic settlement is rejected while paid history stays intact',async()=>{
 const row=(await db.query<any>(`INSERT INTO binance_deposits(kind,status) VALUES('eps','expired') RETURNING id`)).rows[0];
 await expect(db.query(`UPDATE binance_deposits SET status='credited' WHERE id=$1`,[row.id])).rejects.toThrow('automatic credit forbidden');
 await db.exec(`INSERT INTO binance_deposits(kind,status,created_at) VALUES('eps','credited',now()-interval '3 days'); SELECT expire_payment_attempts();`);
 expect((await db.query<any>(`SELECT count(*)::int n FROM binance_deposits WHERE status='credited'`)).rows[0]?.n).toBe(1);
});
test('late website settlement rejects paid flags and preserves existing paid orders',async()=>{
 const row=(await db.query<any>(`INSERT INTO orders(source,status,payment_method,created_at) VALUES('website','pending','oxapay',now()-interval '31 minutes') RETURNING id`)).rows[0];
 await expect(db.query(`UPDATE orders SET meta='{"oxapay_paid":true}' WHERE id=$1`,[row.id])).rejects.toThrow('automatic settlement forbidden');
 await db.exec(`INSERT INTO orders(source,status,payment_method,created_at,meta) VALUES('website','pending','eps',now()-interval '3 days','{"eps_paid":true}'); SELECT expire_payment_attempts();`);
 expect((await db.query<any>(`SELECT status FROM orders WHERE meta->>'eps_paid'='true'`)).rows[0]?.status).toBe('pending');
});