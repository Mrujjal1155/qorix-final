import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const migrate = async (file: string) => db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"));
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source text,status text,telegram_id bigint,reseller_id uuid,user_id uuid,order_no int,customer_name text,product_name text,quantity int,payment_method text,meta jsonb DEFAULT '{}');
    CREATE TABLE bot_users(telegram_id bigint,first_name text,username text);
    CREATE TABLE profiles(id uuid,full_name text);
    CREATE TABLE transactions(id uuid DEFAULT gen_random_uuid(),type text,status text,telegram_id bigint,method text);
    CREATE TABLE wallet_transactions(id uuid DEFAULT gen_random_uuid(),type text,amount numeric,user_id uuid,reference text);
    CREATE FUNCTION public.payment_order_is_paid(m jsonb) RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(m->>'paid','false')='true' OR coalesce(m->>'eps_paid','false')='true' OR coalesce(m->>'oxapay_paid','false')='true' OR nullif(m->>'paid_at','') IS NOT NULL OR m#>>'{binance,status}'='verified' OR m#>>'{bybit,status}'='verified' OR m#>>'{blockchain,status}'='verified'$$;
    INSERT INTO orders(source,status,meta) VALUES('website','completed','{"paid":true}');`);
  await migrate("20261024173940_f624f650-eb88-4a93-a8b9-83d3b6bb6003.sql");
  await migrate("20261121151235_969493b4-10c8-4370-8d71-44eadf91caad.sql");
  await migrate("20261121151341_db3a2d35-93bf-4096-831c-c616836192d5.sql");
  await migrate("20261121151443_e6e842f0-8ad7-4763-af8c-6271fdfe8957.sql");
  await migrate("20261121151640_32936797-fed5-4650-bd49-981f0880a751.sql");
  await migrate("20261121151725_258197ac-1a4b-44d6-9017-7c3c9a723655.sql");
  await migrate("20261121151936_d5a50b4e-f6c5-4097-917d-2bddb257ef36.sql");
}, 30000);
afterAll(() => db.close());
test("historical completed and paid orders are not broadcast", async () => {
  expect((await db.query("select * from live_update_events")).rows).toHaveLength(0);
});
test("every verified website gateway emits one payment and one later delivery event", async () => {
  for (const [method, meta] of [["binance", {binance:{status:"verified"}}], ["bybit",{bybit:{status:"verified"}}], ["chain_bep20",{blockchain:{status:"verified"}}], ["EPS",{eps_paid:true}], ["oxapay",{oxapay_paid:true}]] as const) {
    const order = (await db.query<{id:string}>("insert into orders(source,status,telegram_id,product_name,quantity,payment_method) values('website','pending',2808123968,'Example product',2,$1) returning id", [method])).rows[0];
    if (!order) throw new Error("Missing fixture order");
    await db.query("update orders set meta=$1 where id=$2", [JSON.stringify(meta), order.id]);
    expect((await db.query("select * from live_update_events where ref=$1 and kind='payment' and general_enabled", [`payment:${order.id}`])).rows).toHaveLength(1);
    expect((await db.query("select * from live_update_events where ref=$1", [`order:${order.id}`])).rows).toHaveLength(0);
    await db.query("update orders set status='completed' where id=$1",[order.id]);
    await db.query("update orders set status='completed',meta=meta||'{\"extra\":true}' where id=$1",[order.id]);
    expect((await db.query("select * from live_update_events where ref in ($1,$2) and general_enabled",[`payment:${order.id}`,`order:${order.id}`])).rows).toHaveLength(2);
  }
});
test("wallet purchase does not falsely announce a second topup", async () => {
  const order = (await db.query<{id:string}>("insert into orders(source,status,payment_method,meta) values('website','completed','wallet','{\"paid\":true}') returning id")).rows[0];
  expect((await db.query("select * from live_update_events where ref=$1",[`payment:${order?.id}`])).rows).toHaveLength(0);
  expect((await db.query("select * from live_update_events where ref=$1 and general_enabled",[`order:${order?.id}`])).rows).toHaveLength(1);
});
test("old deployed senders cannot consume new payment-only events as purchase cards", async () => {
  expect((await db.query("select * from live_update_events where kind='payment' and status='pending'")).rows).toHaveLength(0);
  expect((await db.query("select * from live_update_events where kind='payment' and status='awaiting_sender'")).rows).toHaveLength(5);
});
test("bot deposit and website wallet credit both opt into both-group delivery", async () => {
  const tx = (await db.query<{id:string}>("insert into transactions(type,status,telegram_id,method) values('deposit','completed',2808123968,'stars') returning id")).rows[0];
  const wtx = (await db.query<{id:string}>("insert into wallet_transactions(type,amount,reference) values('topup',2,'EPS') returning id")).rows[0];
  expect((await db.query("select * from live_update_events where ref in ($1,$2) and general_enabled",[`tx:${tx?.id}`,`wtx:${wtx?.id}`])).rows).toHaveLength(2);
});
test("unpaid, failed and cancelled orders never announce payment or delivery", async () => {
  for (const status of ['pending','cancelled','failed']) {
    const order = (await db.query<{id:string}>("insert into orders(source,status,payment_method) values('website',$1,'EPS') returning id",[status])).rows[0];
    expect((await db.query("select * from live_update_events where ref in ($1,$2)",[`payment:${order?.id}`,`order:${order?.id}`])).rows).toHaveLength(0);
  }
});
test("public payment payload masks identity at rendering and stores no delivery or email fields", async () => {
  const row = (await db.query<{payload:Record<string,unknown>}>("select payload from live_update_events where kind='payment' limit 1")).rows[0];
  expect(Object.keys(row?.payload ?? {}).sort()).toEqual(['method','name','product','qty','source','uid']);
});
test("customers cannot create events or write group receipts and RLS stays on", async () => {
  expect((await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where oid='live_update_events'::regclass")).rows[0]?.relrowsecurity).toBe(true);
  const grants = (await db.query<{anon_write:boolean;customer_write:boolean}>("select has_table_privilege('anon','live_update_events','INSERT') as anon_write,has_table_privilege('authenticated','live_update_events','UPDATE') as customer_write")).rows[0];
  expect(grants?.anon_write).toBe(false); expect(grants?.customer_write).toBe(false);
  await db.exec("SET ROLE authenticated");
  await expect(db.query("update live_update_events set general_sent=true")).rejects.toThrow("permission denied");
  await expect(db.query("select live_update_enqueue('topup','fake','{}')")).rejects.toThrow("permission denied");
  await db.exec("RESET ROLE");
});
test("notification storage failure never blocks a successful payment or delivery", async () => {
  await db.exec("BEGIN; ALTER TABLE live_update_events RENAME TO unavailable_events");
  try {
    const order = (await db.query<{status:string}>("insert into orders(source,status,payment_method,meta) values('website','completed','EPS','{\"eps_paid\":true}') returning status")).rows[0];
    expect(order?.status).toBe("completed");
  } finally { await db.exec("ROLLBACK"); }
});