import { beforeAll, afterAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Isolated PostgreSQL only: never connect these fixtures to the live store.
const db = new PGlite();
const rid = "22222222-2222-4222-8222-222222222222";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role'::text $$;
    CREATE TABLE public.resellers(id uuid PRIMARY KEY,balance numeric);
    CREATE TABLE public.orders(id uuid PRIMARY KEY,reseller_id uuid,payment_method text,status text,meta jsonb,external_ref text,total numeric,quantity integer,product_name text,delivered_content text);
    CREATE TABLE public.reseller_transactions(id bigserial PRIMARY KEY,reseller_id uuid,type text,amount numeric,balance_after numeric,reference text,note text);
    CREATE FUNCTION public.reseller_adjust_balance(_reseller_id uuid,_amount numeric,_type text,_reference text,_note text) RETURNS numeric LANGUAGE plpgsql AS $$ DECLARE b numeric; BEGIN
      UPDATE public.resellers SET balance=balance+_amount WHERE id=_reseller_id RETURNING balance INTO b;
      IF b<0 THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
      INSERT INTO public.reseller_transactions(reseller_id,type,amount,balance_after,reference,note) VALUES(_reseller_id,_type,_amount,b,_reference,_note); RETURN b; END $$;
    INSERT INTO public.resellers VALUES('${rid}',100);`);
  for (const file of ["20261108051410_43024c77-d76d-4488-8633-223b73d7a213.sql", "20261108051456_497315cf-b9ea-43fb-9eed-bd9863dd33cc.sql"])
    await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => { await db.close(); });

async function order(n: number) {
  const id = `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
  await db.query(`INSERT INTO public.orders VALUES($1::uuid,$2::uuid,'reseller_balance','pending','{"reseller_owner_rule":true,"refunded":false}',$1::uuid::text,10,1,'Subscription',NULL)`, [id,rid]);
  return id;
}
async function debit(id: string) {
  return (await db.query<{ result: any }>("SELECT public.debit_reseller_order($1) result", [id])).rows[0]?.result;
}
async function refund(id: string) {
  return (await db.query<{ result: any }>("SELECT public.refund_failed_reseller_order($1,'delivery_rejected','private fixture') result", [id])).rows[0]?.result;
}
async function read(id: string) {
  return (await db.query<any>(`SELECT o.*,r.balance,(SELECT count(*)::int FROM public.reseller_transactions t WHERE t.reference=o.external_ref AND t.type='refund') refund_count FROM public.orders o JOIN public.resellers r ON r.id=o.reseller_id WHERE o.id=$1`,[id])).rows[0];
}

test("actual SQL refunds original debit once; second direct attempt changes nothing", async () => {
  const id=await order(1);
  expect((await debit(id)).status).toBe("debited");
  expect((await refund(id)).changed).toBe(true);
  const first=await read(id);
  expect(first.status).toBe("failed"); expect(first.meta.refunded).toBe(true);
  expect(first.meta.refund_amount).toBe(10); expect(Number(first.balance)).toBe(100);
  expect(first.refund_count).toBe(1);
  expect((await refund(id)).changed).toBe(false);
  expect(await read(id)).toEqual(first);
  await expect(db.query("SELECT public.reseller_adjust_balance($1,10,'refund',$2,'second credit')",[rid,id])).rejects.toThrow("Order cannot be refunded");
  expect(await read(id)).toEqual(first);
  await expect(db.query("UPDATE public.orders SET status='pending' WHERE id=$1",[id])).rejects.toThrow("Refunded order is terminal");
});
test("actual SQL cancelled and expired debited rows retain funds and have no refund", async () => {
  for (const [n,status] of [[2,"cancelled"],[3,"expired"]] as const) {
    const id=await order(n); await debit(id);
    await db.query("UPDATE public.orders SET status=$2 WHERE id=$1",[id,status]);
    const before=await read(id);
    expect(before.status).toBe(status); expect(before.delivered_content).toBeNull();
    expect(before.meta.refunded).toBe(false); expect(before.refund_count).toBe(0);
    expect((await refund(id)).status).toBe("ineligible");
    expect(await read(id)).toEqual(before);
    await expect(db.query("SELECT public.reseller_adjust_balance($1,10,'refund',$2,'cancel refund')",[rid,id])).rejects.toThrow("Order cannot be refunded");
    expect(await read(id)).toEqual(before);
  }
  expect(Number((await read("11111111-1111-4111-8111-000000000003")).balance)).toBe(80);
});
test("actual SQL success is completed with original debit and zero refunds", async () => {
  const id=await order(4); await debit(id);
  expect((await debit(id)).changed).toBe(false);
  await db.query("UPDATE public.orders SET status='completed',delivered_content='account' WHERE id=$1",[id]);
  expect((await refund(id)).status).toBe("ineligible");
  const result=await read(id);
  expect(result.status).toBe("completed"); expect(result.meta.refunded).toBe(false);
  expect(result.refund_count).toBe(0); expect(Number(result.balance)).toBe(70);
});
test("actual SQL insufficient balance does not create debit/refund ledger", async () => {
  const id=await order(5);
  await db.query("UPDATE public.orders SET total=100 WHERE id=$1",[id]);
  expect(await debit(id)).toMatchObject({ status:"insufficient_balance",balance:70,required:100 });
  const result=await read(id); expect(result.refund_count).toBe(0);
  expect(result.meta).not.toHaveProperty("debit_amount");
  expect((await db.query<any>("SELECT count(*)::int n FROM public.reseller_transactions WHERE reference=$1",[id])).rows[0]?.n).toBe(0);
});