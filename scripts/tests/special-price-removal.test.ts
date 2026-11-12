import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { buildSpecialPriceRemovalNotice, removeSpecialPrice } from "../../src/lib/bot/special-price.server";
import { uiKeysOf } from "../../src/lib/bot/ui.server";

// Isolated PostgreSQL fixtures only; never remove a real price or send Telegram messages.
const db = new PGlite();
const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const reseller = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const product = { id: "11111111-1111-4111-8111-111111111111", name: "Product <A>", price: 12.5 };
const rowId = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.role',true),'service_role') $$;
    CREATE FUNCTION public.has_role(_id uuid,_role text) RETURNS boolean LANGUAGE sql AS $$ SELECT _id='${admin}'::uuid AND _role='admin' $$;
    CREATE TABLE user_product_prices(id uuid PRIMARY KEY,telegram_id bigint,product_id uuid,price numeric,min_qty integer);
    CREATE TABLE reseller_product_prices(id uuid PRIMARY KEY,reseller_id uuid,product_id uuid,price numeric,min_qty integer);
    CREATE TABLE resellers(id uuid PRIMARY KEY,telegram_id bigint,is_active boolean);
    CREATE TABLE bot_users(telegram_id bigint PRIMARY KEY,is_banned boolean,contact_status text);
    CREATE TABLE stock_notification_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_key text UNIQUE,kind text,source text,status text,delivered_at timestamptz,audience_message jsonb,product_snapshot jsonb);
    CREATE TABLE stock_notification_recipients(event_id uuid,telegram_id bigint,PRIMARY KEY(event_id,telegram_id));
    INSERT INTO bot_users VALUES(123,false,'reachable'),(456,false,'reachable'),(789,false,'blocked');
    INSERT INTO resellers VALUES('${reseller}',456,true);`);
  await db.exec(await readFile(new URL("../../supabase/migrations/20261112120506_dc141b0e-1bf8-4b8a-a787-fcf1abb5aab2.sql", import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => { await db.close(); });
async function insert(n: number, kind = "user", target = "123") {
  await db.query(`INSERT INTO ${kind === "user" ? "user_product_prices" : "reseller_product_prices"} VALUES($1,$2,$3,10,3)`, [rowId(n), target, product.id]);
}
async function remove(n: number, kind: "user" | "reseller" = "user", target = "123", caller = admin, price = 10) {
  return (await db.query<{ result: any }>("SELECT remove_special_price_notice($1,$2,$3,$4,$5,3,$6,$7) result", [kind,rowId(n),target,product.id,price,buildSpecialPriceRemovalNotice(kind,product,{}),caller])).rows[0]?.result;
}
test("user removal deletes only selected price and queues exactly its personal recipient once", async () => {
  await insert(1); await insert(2);
  expect(await remove(1)).toEqual({ ok: true, notice: "queued" });
  const rows = (await db.query<any>("SELECT * FROM user_product_prices ORDER BY id")).rows;
  expect(rows.map(r => r.id)).toEqual([rowId(2)]);
  expect((await db.query<any>("SELECT telegram_id::text id FROM stock_notification_recipients")).rows).toEqual([{ id: "123" }]);
  expect(await remove(1)).toEqual({ ok: true, notice: "unchanged" });
  expect((await db.query<any>("SELECT count(*)::int n FROM stock_notification_recipients")).rows[0]?.n).toBe(1);
});
test("linked reseller removal addresses only its verified stored Telegram user", async () => {
  await insert(3,"reseller",reseller);
  expect(await remove(3,"reseller",reseller)).toEqual({ ok: true, notice: "queued" });
  expect((await db.query<any>("SELECT telegram_id::text id FROM stock_notification_recipients ORDER BY telegram_id")).rows).toEqual([{ id:"123" },{ id:"456" }]);
});
test("blocked user price removal succeeds without queuing an undeliverable notice", async () => {
  await insert(4,"user","789");
  expect(await remove(4,"user","789")).toEqual({ ok: true, notice: "unreachable" });
  expect((await db.query<any>("SELECT count(*)::int n FROM stock_notification_recipients WHERE telegram_id=789")).rows[0]?.n).toBe(0);
});
test("non-admin and non-service callers cannot remove prices", async () => {
  await insert(5);
  await expect(remove(5,"user","123",reseller)).rejects.toThrow("Forbidden");
  await db.exec("SET test.role='authenticated'");
  try { await expect(remove(5)).rejects.toThrow("Forbidden"); }
  finally { await db.exec("SET test.role='service_role'"); }
  expect((await db.query<any>("SELECT count(*)::int n FROM user_product_prices WHERE id=$1",[rowId(5)])).rows[0]?.n).toBe(1);
});
test("a changed price or mismatched target cannot be removed using a stale snapshot", async () => {
  await insert(6);
  await expect(remove(6,"user","456")).rejects.toThrow("Special price changed");
  await expect(remove(6,"user","123",admin,9)).rejects.toThrow("Special price changed");
  expect((await db.query<any>("SELECT price::text price FROM user_product_prices WHERE id=$1",[rowId(6)])).rows[0]?.price).toBe("10");
});
test("queue failure rolls back the selected price removal", async () => {
  await insert(7);
  await db.exec(`CREATE FUNCTION fail_test_recipient() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'queue unavailable'; END $$;
    CREATE TRIGGER fail_test_recipient BEFORE INSERT ON stock_notification_recipients FOR EACH ROW EXECUTE FUNCTION fail_test_recipient();`);
  try { await expect(remove(7)).rejects.toThrow("queue unavailable"); }
  finally { await db.exec("DROP TRIGGER fail_test_recipient ON stock_notification_recipients"); }
  expect((await db.query<any>("SELECT count(*)::int n FROM user_product_prices WHERE id=$1",[rowId(7)])).rows[0]?.n).toBe(1);
  expect((await db.query<any>("SELECT count(*)::int n FROM stock_notification_events")).rows[0]?.n).toBe(2);
});
test("removal premium icons remain editable in the existing Bot Admin group", () => {
  expect(uiKeysOf("specialprice")).toContain("special_removed_title");
  expect(uiKeysOf("specialprice")).toContain("special_removed");
  const message = buildSpecialPriceRemovalNotice("user",product,{ ui_icon_special_removed:"5400280896311944999|❌",ui_icon_special_buy:"5400280896311944998|🛒" });
  expect(message.text).toContain('emoji-id="5400280896311944999"');
  expect(message.keyboard[0]?.[0]?.icon_custom_emoji_id).toBe("5400280896311944998");
  expect(message.keyboard[0]?.[0]?.callback_data).toBe(`qty:${product.id}`);
  for (const button of message.keyboard.flat()) expect(new TextEncoder().encode(button.callback_data).length).toBeLessThanOrEqual(64);
  expect(message.text.length).toBeLessThanOrEqual(4096);
});
test("server removal uses the stored target and exact snapshot in the atomic RPC", async () => {
  let params: any;
  const fixture = { id:rowId(8),telegram_id:123,product_id:product.id,price:10,min_qty:3 };
  const fake = {
    from: (table: string) => { const chain: any = { select:()=>chain,eq:()=>chain,maybeSingle:async()=>({ data:table==="products" ? product : fixture }),in:async()=>({ data:[] }) }; return chain; },
    rpc: async (name: string,args: any) => { expect(name).toBe("remove_special_price_notice"); params=args; return { data:{ ok:true,notice:"queued" } }; },
  };
  expect(await removeSpecialPrice(fake,"user",rowId(8),admin)).toEqual({ ok:true,notice:"queued" });
  expect(params._target).toBe("123"); expect(params._expected_price).toBe(10); expect(params._expected_min_qty).toBe(3);
  expect(params._message.kind).toBe("special_price_removed"); expect(params._admin_id).toBe(admin);
});
test("notice preparation failure never calls the removal RPC", async () => {
  let writes=0;
  const fake = { from: (table: string) => { const chain:any={ select:()=>chain,eq:()=>chain,maybeSingle:async()=> table==="products" ? { error:{} } : { data:{ product_id:product.id } },in:async()=>({ data:[] }) }; return chain; },rpc:async()=>{ writes++; } };
  await expect(removeSpecialPrice(fake,"user",rowId(9),admin)).rejects.toThrow("nothing was removed");
  expect(writes).toBe(0);
});