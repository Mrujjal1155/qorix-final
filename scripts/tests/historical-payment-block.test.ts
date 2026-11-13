import { beforeAll, afterAll, test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
    CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END $$;
    CREATE TABLE binance_used_txs(tx_id text PRIMARY KEY);
    CREATE TABLE bot_users(balance numeric); INSERT INTO bot_users VALUES(50);`);
  await db.exec(await readFile(new URL("../../supabase/migrations/20261113080713_f783583e-bb88-4ecc-8984-95461397e2c2.sql",import.meta.url),"utf8"));
  await db.exec(`INSERT INTO binance_used_txs VALUES('ORDER123'),('bybit:transfer123'),('chain:bep20:0xabc');
    INSERT INTO historical_payment_txid_blocks(transaction_key,gateway,cutoff_at,reason) VALUES
    ('ORDER123','payid','2026-11-13T08:04:00Z','Owner requested used-ID block'),
    ('bybit:transfer123','bybit','2026-11-13T08:04:00Z','Owner requested used-ID block'),
    ('chain:bep20:0xabc','chain_bep20','2026-11-13T08:04:00Z','Owner requested used-ID block');`);
},30000);
afterAll(async()=>db.close());
test("historical Binance ID and case variations cannot be claimed again",async()=>{
  await expect(db.exec("INSERT INTO binance_used_txs VALUES('ORDER123')")).rejects.toThrow("already used");
  await expect(db.exec("INSERT INTO binance_used_txs VALUES('order123')")).rejects.toThrow("already used");
});
test("historical Bybit and blockchain IDs cannot be claimed again",async()=>{
  await expect(db.exec("INSERT INTO binance_used_txs VALUES('bybit:transfer123')")).rejects.toThrow("already used");
  await expect(db.exec("INSERT INTO binance_used_txs VALUES('chain:bep20:0xabc')")).rejects.toThrow("already used");
});
test("blocking old IDs does not add balance or block EPS and OxaPay",async()=>{
  expect((await db.query<any>("SELECT balance::text balance FROM bot_users")).rows[0]?.balance).toBe("50");
  await db.exec("INSERT INTO binance_used_txs VALUES('eps:ORDER123'),('oxapay:ORDER123'),('NEW_ORDER123')");
  expect((await db.query<any>("SELECT count(*)::int n FROM historical_payment_txid_blocks")).rows[0]?.n).toBe(3);
});