import { beforeAll, afterAll, test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { paymentTransactionKey, reconciliationState } from "../../src/lib/payment-reconciliation";
const db = new PGlite();
const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12,"0")}`;
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.role',true),'service_role') $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${admin}'::uuid $$;
    CREATE FUNCTION has_role(u uuid,r text) RETURNS boolean LANGUAGE sql AS $$ SELECT u='${admin}'::uuid AND r='admin' $$;
    CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    CREATE TABLE binance_deposits(id uuid PRIMARY KEY,kind text,telegram_id bigint,amount_usdt numeric,status text,tx_id text,meta jsonb DEFAULT '{}');
    CREATE TABLE binance_used_txs(tx_id text PRIMARY KEY);
    CREATE TABLE payment_requests(telegram_id bigint,status text,txid text,admin_note text);
    CREATE TABLE bot_users(telegram_id bigint PRIMARY KEY,balance numeric);
    INSERT INTO bot_users VALUES(123,50);`);
  const folder = new URL("../../supabase/migrations/",import.meta.url);
  for (const name of (await readdir(folder)).sort()) {
    const sql = await readFile(new URL(name,folder),"utf8");
    if (sql.includes("CREATE TABLE public.payment_manual_reconciliations") || sql.includes("CREATE FUNCTION public.guard_manual_payment_reuse")) await db.exec(sql);
  }
},30000);
afterAll(async () => db.close());
async function deposit(n: number,kind="bybit",tx=`transfer_${n}`,status="pending") {
  await db.query("INSERT INTO binance_deposits(id,kind,telegram_id,amount_usdt,status,tx_id) VALUES($1,$2,123,10,$3,$4)",[id(n),kind,status,tx]);
  return tx;
}
async function mark(n:number,tx:string,keys:string[],caller=admin,reason="Manual adjustment verified") {
  return (await db.query<any>("SELECT reconcile_manual_deposit($1,$2,$3,$4,$5) result",[id(n),tx,keys,reason,caller])).rows[0]?.result;
}
test("manual reconciliation reserves Bybit ID but never adds wallet balance",async()=>{
  const tx=await deposit(1); expect(await mark(1,tx,[`bybit:${tx}`])).toEqual({ok:true,changed:true});
  expect((await db.query<any>("SELECT balance::text balance FROM bot_users WHERE telegram_id=123")).rows[0]?.balance).toBe("50");
  expect((await db.query<any>("SELECT status,meta->>'manual_no_credit' no_credit FROM binance_deposits WHERE id=$1",[id(1)])).rows[0]).toEqual({status:"credited",no_credit:"true"});
});
test("same button twice creates one receipt and no second reservation",async()=>{
  expect(await mark(1,"transfer_1",["bybit:transfer_1"])).toEqual({ok:true,changed:false});
  expect((await db.query<any>("SELECT count(*)::int n FROM payment_manual_reconciliations WHERE deposit_id=$1",[id(1)])).rows[0]?.n).toBe(1);
});
test("another deposit cannot reserve a manually handled Bybit transaction",async()=>{
  const tx=await deposit(2,"bybit","transfer_1"); expect(await mark(2,tx,[`bybit:${tx}`])).toEqual({ok:false,code:"already_used"});
});
test("automatic claim winning first stops manual reconciliation",async()=>{
  const tx=await deposit(3); await db.query("INSERT INTO binance_used_txs VALUES($1)",[`bybit:${tx}`]);
  expect(await mark(3,tx,[`bybit:${tx}`])).toEqual({ok:false,code:"already_used"});
});
test("non-admin and non-service callers are rejected",async()=>{
  const tx=await deposit(4); await expect(mark(4,tx,[`bybit:${tx}`],id(99))).rejects.toThrow("Forbidden");
  await db.exec("SET test.role='authenticated'"); try {await expect(mark(4,tx,[`bybit:${tx}`])).rejects.toThrow("Forbidden");}finally{await db.exec("SET test.role='service_role'");}
});
test("other gateways and stale IDs cannot be reconciled",async()=>{
  const tx=await deposit(5,"eps"); await expect(mark(5,tx,[tx])).rejects.toThrow("Unsupported");
  await deposit(6); await expect(mark(6,"changed_id",["bybit:changed_id"])).rejects.toThrow("Payment changed");
});
test("BEP20 and TRC20 reserve canonical prefixed transaction IDs",async()=>{
  for(const [n,kind,tx] of [[7,"chain_bep20",`0x${"a".repeat(64)}`],[8,"chain_trc20","b".repeat(64)]] as const){
    await deposit(n,kind,tx); const key=paymentTransactionKey(kind,tx); expect(await mark(n,tx,[key])).toEqual({ok:true,changed:true});
    await expect(db.query("INSERT INTO binance_used_txs VALUES($1)",[key])).rejects.toThrow();
  }
});
test("Binance aliases and letter-case variants are blocked without a second credit",async()=>{
  const tx=await deposit(9,"payid","ORDERABC"); await db.exec("INSERT INTO payment_requests VALUES(123,'pending','TXALIAS',null)");
  expect(await mark(9,tx,[tx,"TXALIAS"])).toEqual({ok:true,changed:true});
  await expect(db.exec("INSERT INTO binance_used_txs VALUES('txalias')")).rejects.toThrow("already used");
  expect((await db.query<any>("SELECT status FROM payment_requests WHERE txid='TXALIAS'")).rows[0]?.status).toBe("manual_reconciled");
});
test("receipt failure rolls back transaction reservations",async()=>{
  const tx=await deposit(10);
  await db.exec("CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt unavailable'; END $$; CREATE TRIGGER fail_receipt BEFORE INSERT ON payment_manual_reconciliations FOR EACH ROW EXECUTE FUNCTION fail_receipt()");
  try{await expect(mark(10,tx,[`bybit:${tx}`])).rejects.toThrow("receipt unavailable");}finally{await db.exec("DROP TRIGGER fail_receipt ON payment_manual_reconciliations");}
  expect((await db.query<any>("SELECT count(*)::int n FROM binance_used_txs WHERE tx_id=$1",[`bybit:${tx}`])).rows[0]?.n).toBe(0);
});
test("gateway keys and states distinguish manual verification from missing or used IDs",()=>{
  expect(paymentTransactionKey("chain_bep20",`0x${"A".repeat(64)}`)).toBe(`chain:bep20:0x${"a".repeat(64)}`);
  expect(()=>paymentTransactionKey("eps","transfer123")).toThrow();
  expect(reconciliationState({status:"pending",tx_id:"transfer"},false)).toBe("unverified");
  expect(reconciliationState({status:"pending",tx_id:"transfer"},true)).toBe("used");
  expect(reconciliationState({status:"credited"},true,{reason:"manual",admin_id:admin,created_at:"today"})).toBe("manual_verified");
});