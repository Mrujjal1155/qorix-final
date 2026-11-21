import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

test("tracking finds 1042, QX-93ru3 and email independently and excludes reseller orders", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
      SET test.role='service_role';
      CREATE TABLE orders(id uuid,order_no bigint,external_ref text,product_name text,quantity integer,total numeric,status text,delivered_content text,created_at timestamptz,customer_email text,reseller_id uuid,source text);
      INSERT INTO orders VALUES
      ('00000000-0000-0000-0000-000079192548',1042,'QX-93ru3','Product',1,2,'completed','private',now(),'buyer@example.com',NULL,'website'),
      ('00000000-0000-0000-0000-000079192549',1043,'QX-93ru4','Reseller',1,2,'completed','private',now(),'buyer@example.com','00000000-0000-0000-0000-000000000001','api_website');`);
    await db.exec(await readFile(new URL("../../supabase/migrations/20261121091843_ce1c73db-cf2d-4bd8-85b0-4a61ab53289a.sql", import.meta.url), "utf8"));
    for (const [kind, value] of [["number", "1042"], ["code", "QX-93ru3"], ["code", "ORD-79192548"], ["email", "Buyer@example.com"]]) {
      const result = await db.query<{ order_no: number }>("SELECT order_no FROM find_tracking_orders($1,$2)", [kind, value]);
      expect(result.rows.map(r => Number(r.order_no))).toEqual([1042]);
    }
    expect((await db.query("SELECT * FROM find_tracking_orders('email','%')")).rows).toEqual([]);
    expect((await db.query("SELECT * FROM find_tracking_orders('code','QX-93ru4')")).rows).toEqual([]);
    await db.exec("SET test.role='anon'");
    await expect(db.query("SELECT * FROM find_tracking_orders('number','1042')")).rejects.toThrow("Forbidden");
    expect((await db.query("SELECT has_function_privilege('anon','find_tracking_orders(text,text)','EXECUTE') AS allowed")).rows[0]?.['allowed']).toBe(false);
  } finally { await db.close(); }
}, 30000);