import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE bot_users(id uuid DEFAULT gen_random_uuid(),telegram_id bigint PRIMARY KEY,is_banned boolean DEFAULT false);
    CREATE TABLE binance_deposits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),telegram_id bigint,kind text,amount_usdt numeric,status text DEFAULT 'pending',meta jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '30 minutes');
    CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_no bigint GENERATED ALWAYS AS IDENTITY,telegram_id bigint,product_id uuid,product_name text,quantity integer,unit_price numeric,total numeric,status text,delivery_type text,coupon_code text,discount numeric,meta jsonb);
    INSERT INTO bot_users(telegram_id) VALUES(1042);`);
  const folder = new URL("../../supabase/migrations/", import.meta.url);
  const names = (await readdir(folder)).filter(n => /2026112113/.test(n)).sort();
  for (const name of names) {
    const sql = await readFile(new URL(name, folder), "utf8");
    if (/bot_browser_payment|browser_deposit/.test(sql)) await db.exec(sql);
  }
  return db;
}
const order = [{ product_id: "00000000-0000-0000-0000-000000000001", product_name: "Product", quantity: 5, unit_price: 0.4, total: 2, discount: 0, delivery_type: "auto", coupon_code: null }];
async function issue(db: PGlite, hash = "a".repeat(64)) {
  const r = await db.query<{ link: { id: string } }>("SELECT issue_bot_browser_payment(1042,$1,$2::jsonb,2,$3::jsonb) AS link", [hash, JSON.stringify({ items: [{ product_id: order[0]?.product_id, qty: 5 }] }), JSON.stringify(order)]);
  const id = r.rows[0]?.link.id; if (!id) throw new Error("Missing link"); return id;
}
async function attach(db: PGlite, id: string, amount = 2) {
  await db.query("UPDATE bot_browser_payments SET status='starting',gateway='payid' WHERE id=$1", [id]);
  const r = await db.query<{ id: string }>("INSERT INTO binance_deposits(telegram_id,kind,amount_usdt,meta) VALUES(1042,'payid',$1,jsonb_build_object('browser_link_id',$2::text)) RETURNING id", [amount, id]);
  const deposit = r.rows[0]?.id; if (!deposit) throw new Error("Missing deposit"); return deposit;
}
test("browser payment reserves quantity 5 at $2, then attaches the SAME original order before any provider payment", async () => {
  const db = await setup(); try {
    const id = await issue(db); const before = await db.query<{ id: string }>("SELECT id FROM orders");
    const deposit = await attach(db, id);
    const after = await db.query<{ id: string; quantity: number; total: string; deposit_id: string }>("SELECT id,quantity,total,meta->>'deposit_id' AS deposit_id FROM orders");
    expect(after.rows[0]?.id).toBe(before.rows[0]?.id); expect(after.rows[0]?.quantity).toBe(5);
    expect(Number(after.rows[0]?.total)).toBe(2); expect(after.rows[0]?.deposit_id).toBe(deposit);
    await db.query("SELECT bind_bot_browser_payment($1,$2)", [id, deposit]);
    expect((await db.query("SELECT * FROM orders")).rows.length).toBe(1);
  } finally { await db.close(); }
}, 30000);
test("one link cannot create a second order or second gateway attempt", async () => {
  const db = await setup(); try {
    const id = await issue(db); await expect(issue(db, "b".repeat(64))).rejects.toThrow("existing payment link");
    await attach(db, id);
    await expect(db.query("INSERT INTO binance_deposits(telegram_id,kind,amount_usdt,meta) VALUES(1042,'payid',2,jsonb_build_object('browser_link_id',$1::text))", [id])).rejects.toThrow("Browser payment unavailable");
    expect((await db.query("SELECT * FROM binance_deposits")).rows.length).toBe(1);
    expect((await db.query("SELECT * FROM orders")).rows.length).toBe(1);
  } finally { await db.close(); }
}, 30000);
test("payment amount cannot be changed from $2 to $1", async () => {
  const db = await setup(); try { const id = await issue(db); await expect(attach(db, id, 1)).rejects.toThrow("Browser payment unavailable"); expect((await db.query("SELECT * FROM binance_deposits")).rows.length).toBe(0); } finally { await db.close(); }
}, 30000);
test("gateway selection does not extend the original 30-minute deadline", async () => {
  const db = await setup(); try {
    const id = await issue(db);
    await db.query("UPDATE bot_browser_payments SET created_at=now()-interval '20 minutes',expires_at=now()+interval '10 minutes' WHERE id=$1", [id]);
    const deposit = await attach(db, id);
    const r = await db.query<{ same: boolean; minutes: string }>("SELECT b.expires_at=l.expires_at AS same,extract(epoch FROM b.expires_at-b.created_at)/60 AS minutes FROM binance_deposits b JOIN bot_browser_payments l ON l.deposit_id=b.id WHERE b.id=$1", [deposit]);
    expect(r.rows[0]?.same).toBe(true); expect(Number(r.rows[0]?.minutes)).toBeCloseTo(30, 1);
  } finally { await db.close(); }
}, 30000);
test("cancellation closes both the link and pending original order and cannot cancel paid deposits", async () => {
  const db = await setup(); try {
    const id = await issue(db); const deposit = await attach(db, id);
    await db.query("SELECT cancel_bot_browser_payment($1,1042)", [id]);
    expect((await db.query<{ status: string }>("SELECT status FROM orders")).rows[0]?.status).toBe("cancelled");
    expect((await db.query<{ status: string }>("SELECT status FROM binance_deposits WHERE id=$1", [deposit])).rows[0]?.status).toBe("failed");
    const next = await issue(db,"b".repeat(64)); const paid = await attach(db,next);
    await db.query("UPDATE binance_deposits SET status='credited' WHERE id=$1",[paid]);
    expect((await db.query<{ cancelled: boolean }>("SELECT cancel_bot_browser_payment($1,1042) AS cancelled",[next])).rows[0]?.cancelled).toBe(false);
    expect((await db.query<{ status: string }>("SELECT status FROM bot_browser_payments WHERE id=$1",[next])).rows[0]?.status).toBe("completed");
  } finally { await db.close(); }
}, 30000);
test("anonymous and signed-in users cannot read links or call service-only payment creation", async () => {
  const db = await setup(); try {
    for (const role of ["anon", "authenticated"]) {
      const r = await db.query<{ table_access: boolean; rpc_access: boolean }>("SELECT has_table_privilege($1,'bot_browser_payments','SELECT') AS table_access,has_function_privilege($1,'issue_bot_browser_payment(bigint,text,jsonb,numeric,jsonb)','EXECUTE') AS rpc_access",[role]);
      expect(r.rows[0]?.table_access).toBe(false); expect(r.rows[0]?.rpc_access).toBe(false);
    }
  } finally { await db.close(); }
}, 30000);