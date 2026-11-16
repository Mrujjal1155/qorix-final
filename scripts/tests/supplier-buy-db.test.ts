import { beforeAll, afterAll, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const db=new PGlite();
const admin='11111111-1111-4111-8111-111111111111',supplier='22222222-2222-4222-8222-222222222222',product='33333333-3333-4333-8333-333333333333';
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
 CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE TABLE public.suppliers(id uuid PRIMARY KEY,is_enabled boolean); CREATE TABLE public.supplier_products(id uuid PRIMARY KEY);
 CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now();RETURN NEW;END$$;
 INSERT INTO auth.users VALUES('${admin}'); INSERT INTO suppliers VALUES('${supplier}',true);INSERT INTO supplier_products VALUES('${product}');`);
 for(const name of ['20261116114120_f121e3a2-7622-4113-9ab9-d6fef73ed41f.sql','20261116114422_751c4ee3-242f-4215-86b1-e58ab46cdfa5.sql','20261116114528_2d60c1b8-b088-4ab1-ae97-c85af0656e15.sql','20261116115307_8fdc592f-7908-4740-b8a4-368156329005.sql']) await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8'));
},30000);
afterAll(()=>db.close());
async function order(external:string,target=50) {
 return (await db.query<{id:string}>(`INSERT INTO supplier_buy_orders(admin_id,supplier_id,supplier_product_id,external_id,product_name,target,status) VALUES($1,$2,$3,$4,'Test',$5,'watching') RETURNING id`,[admin,supplier,product,external,target])).rows[0]?.id;
}
async function claim(id:string|undefined,qty:number){return (await db.query<{id:string|null}>('SELECT claim_supplier_buy_batch($1,$2) id',[id,qty])).rows[0]?.id;}
async function finish(batch:string|null|undefined,status:string,items:string[]){await db.query('SELECT finish_supplier_buy_batch($1,$2,$3::jsonb,NULL,$4)',[batch,status,JSON.stringify(items),'test']);}
test('claim once, save 30 then 20, stop exactly at 50',async()=>{
 const id=await order('complete');const b=await claim(id,30);expect(typeof b).toBe('string');expect(await claim(id,30)).toBeNull();
 await finish(b,'completed',Array(30).fill('account'));await finish(b,'completed',Array(30).fill('account'));
 let row=(await db.query<any>('SELECT acquired,status FROM supplier_buy_orders WHERE id=$1',[id])).rows[0];expect(row).toEqual({acquired:30,status:'watching'});
 const next=await claim(id,20);await finish(next,'completed',Array(20).fill('account'));
 row=(await db.query<any>('SELECT acquired,status FROM supplier_buy_orders WHERE id=$1',[id])).rows[0];expect(row).toEqual({acquired:50,status:'completed'});expect(await claim(id,1)).toBeNull();
});
test('paused and cancelled orders never claim',async()=>{
 const id=await order('pause');await db.query("UPDATE supplier_buy_orders SET status='paused' WHERE id=$1",[id]);expect(await claim(id,50)).toBeNull();
 await db.query("UPDATE supplier_buy_orders SET status='cancelled' WHERE id=$1",[id]);expect(await claim(id,50)).toBeNull();
});
test('uncertain cancelled attempt blocks even a new order for same product',async()=>{
 const id=await order('uncertain');const b=await claim(id,30);
 await db.query("UPDATE supplier_buy_orders SET status='cancelled' WHERE id=$1",[id]);
 const newer=await order('uncertain');expect(await claim(newer,30)).toBeNull();
 await finish(b,'unknown',[]);expect(await claim(newer,30)).toBeNull();
});
test('partial result saves actual items and prevents more spending',async()=>{
 const id=await order('partial');const b=await claim(id,30);await finish(b,'completed',Array(15).fill('account'));
 const row=(await db.query<any>('SELECT acquired,status FROM supplier_buy_orders WHERE id=$1',[id])).rows[0];expect(row).toEqual({acquired:15,status:'review'});expect(await claim(id,20)).toBeNull();
});
test('ordinary signed-in users cannot read deliveries or execute spending RPC',async()=>{
 await db.exec('SET ROLE authenticated');
 const rows=await db.query('SELECT * FROM supplier_buy_batches');expect(rows.rows).toEqual([]);
 await expect(db.query('SELECT claim_supplier_buy_batch(NULL,50)')).rejects.toThrow('permission denied');
 await db.exec('RESET ROLE');
});
async function choiceOrder(external:string){const id=await order(external);await db.query('UPDATE supplier_buy_orders SET quantity_choices=ARRAY[50,40,35] WHERE id=$1',[id]);return id;}
test('40 successful accounts finishes once without buying remaining 10',async()=>{
 const id=await choiceOrder('choices-success');const b=await claim(id,40);await finish(b,'completed',Array(40).fill('account'));
 expect((await db.query<any>('SELECT acquired,status FROM supplier_buy_orders WHERE id=$1',[id])).rows[0]).toEqual({acquired:40,status:'completed'});expect(await claim(id,10)).toBeNull();expect(await claim(id,35)).toBeNull();
});
test('35 successful accounts also finishes once',async()=>{
 const id=await choiceOrder('choices-last');const b=await claim(id,35);await finish(b,'completed',Array(35).fill('account'));expect((await db.query<any>('SELECT status FROM supplier_buy_orders WHERE id=$1',[id])).rows[0]?.status).toBe('completed');expect(await claim(id,15)).toBeNull();
});
test('only exact configured quantities can claim, never below 35',async()=>{const id=await choiceOrder('choices-floor');expect(await claim(id,30)).toBeNull();expect(await claim(id,45)).toBeNull();});
test('stock rejection falls from 50 to 40 to 35 then stops',async()=>{
 const id=await choiceOrder('choices-reject');for(const qty of [50,40,35]){const b=await claim(id,qty);expect(typeof b).toBe('string');await db.query("SELECT finish_supplier_buy_batch($1,'rejected','[]',NULL,'OUT_OF_STOCK')",[b]);expect(await claim(id,qty)).toBeNull();}
 expect((await db.query<any>('SELECT status FROM supplier_buy_orders WHERE id=$1',[id])).rows[0]?.status).toBe('paused');expect(await claim(id,30)).toBeNull();
});
test('non-stock rejection pauses without fallback',async()=>{const id=await choiceOrder('choices-balance');await finish(await claim(id,50),'rejected',[]);expect(await claim(id,40)).toBeNull();});
test('uncertain first choice blocks every smaller purchase',async()=>{const id=await choiceOrder('choices-unknown');await finish(await claim(id,50),'unknown',[]);expect(await claim(id,40)).toBeNull();expect(await claim(id,35)).toBeNull();});
test('stock checks count atomically only while watching',async()=>{const id=await choiceOrder('choices-count');await db.query('SELECT record_supplier_buy_check($1,34,ARRAY[50,40,35])',[id]);await db.query('SELECT record_supplier_buy_check($1,38,ARRAY[50,40,35])',[id]);expect((await db.query<any>('SELECT stock_checks,last_stock,last_choices_checked FROM supplier_buy_orders WHERE id=$1',[id])).rows[0]).toEqual({stock_checks:2,last_stock:38,last_choices_checked:[50,40,35]});});