import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

test("existing recipient RPC includes all 1501 reachable users and both groups once, excluding banned or unreachable users", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      CREATE TABLE bot_users(telegram_id bigint PRIMARY KEY,is_banned boolean DEFAULT false,contact_status text DEFAULT 'unknown');
      CREATE TABLE stock_notification_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_key text UNIQUE,kind text,source text,status text,delivered_at timestamptz,audience_message jsonb,product_snapshot jsonb,created_at timestamptz DEFAULT now());
      CREATE TABLE stock_notification_recipients(event_id uuid,telegram_id bigint,status text DEFAULT 'pending',PRIMARY KEY(event_id,telegram_id));
      INSERT INTO bot_users(telegram_id) SELECT generate_series(1,1501);
      INSERT INTO bot_users VALUES(2001,true,'unknown'),(2002,false,'blocked'),(2003,false,'deactivated'),(2004,false,'stopped'),(0,false,'unknown');
      SET request.jwt.claim.role='service_role';
    `);
    await db.exec(await readFile(new URL("../../supabase/migrations/20261105125430_281f737d-1bac-4d98-9fc9-26e1117fb027.sql", import.meta.url), "utf8"));
    const sql = `SELECT enqueue_product_list('broadcast:product-list:admin:bulk:test', '{"kind":"product_list","text":"saved notice"}'::jsonb, ARRAY[-100111,-100222,-100111]::bigint[]) AS result`;
    const first = await db.query<{ result: { id: string; total: number } }>(sql);
    expect(first.rows[0]?.result.total).toBe(1503);
    const second = await db.query<{ result: { id: string; total: number } }>(sql);
    expect(second.rows[0]?.result).toEqual(first.rows[0]?.result);
    const excluded = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM stock_notification_recipients WHERE telegram_id IN (0,2001,2002,2003,2004)");
    expect(excluded.rows[0]?.count).toBe(0);
    await db.exec("SET request.jwt.claim.role='authenticated'");
    await expect(db.query(sql)).rejects.toThrow("Forbidden");
  } finally { await db.close(); }
});