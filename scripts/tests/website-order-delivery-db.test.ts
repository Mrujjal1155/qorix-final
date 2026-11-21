import { beforeAll, afterAll, test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const id = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE orders(id uuid PRIMARY KEY,source text,status text,telegram_id bigint,reseller_id uuid,delivered_content text);
    INSERT INTO orders VALUES('${id}','website','completed',123,NULL,'historical-account');`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261121150012_954328b7-8b7e-42d7-a5db-785a4c27e0cd.sql', import.meta.url), 'utf8'));
}, 30000);
afterAll(() => db.close());
test("existing completed orders are not mass queued", async () => {
  expect((await db.query("select * from website_order_deliveries")).rows).toHaveLength(0);
});
test("new completion queues exactly one immutable checkout recipient", async () => {
  await db.exec(`UPDATE orders SET status='pending' WHERE id='${id}'; UPDATE orders SET status='completed' WHERE id='${id}'; UPDATE orders SET status='completed' WHERE id='${id}';`);
  const rows = (await db.query<{telegram_id: number}>("select telegram_id from website_order_deliveries")).rows;
  expect(rows).toHaveLength(1); expect(Number(rows[0]?.telegram_id)).toBe(123);
});
test("simultaneous/repeated claims cannot own the same delivery", async () => {
  expect((await db.query("select * from claim_website_order_delivery()")).rows).toHaveLength(1);
  expect((await db.query("select * from claim_website_order_delivery()")).rows).toHaveLength(0);
});
test("interrupted accepted-or-unknown send is reviewed, never blindly replayed", async () => {
  await db.exec("UPDATE website_order_deliveries SET claimed_at=now()-interval '6 minutes'");
  expect((await db.query("select * from claim_website_order_delivery()")).rows).toHaveLength(0);
  expect((await db.query<{status: string}>("select status from website_order_deliveries")).rows[0]?.status).toBe("review");
});
test("guest, pending, bot and reseller orders cannot queue website credentials", async () => {
  for (const [source,status,tid,reseller,content] of [
    ['website','completed',null,null,'item'], ['website','pending',123,null,'item'],
    ['telegram','completed',123,null,'item'], ['website','completed',123,id,'item'], ['website','completed',123,null,''],
  ]) await db.query('insert into orders values(gen_random_uuid(),$1,$2,$3,$4,$5)',[source,status,tid,reseller,content]);
  expect((await db.query('select * from website_order_deliveries')).rows).toHaveLength(1);
});
test("customers cannot read queue or invoke its privileged claim", async () => {
  await db.exec('SET ROLE authenticated');
  await expect(db.query('select * from website_order_deliveries')).rejects.toThrow('permission denied');
  await expect(db.query('select * from claim_website_order_delivery()')).rejects.toThrow('permission denied');
  await db.exec('RESET ROLE');
});