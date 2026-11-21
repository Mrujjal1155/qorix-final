import { expect, test, mock } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { newVendorDraft,vendorAnswer,vendorBack,vendorSubmissionSchema,vendorCanSupply } from '../../src/lib/vendor-application';

test('seven steps preserve all product terms and review before submission',()=>{
  let d=newVendorDraft('single','application');
  for(const a of ['Canva Pro','3 Months','No Warranty','0.65 USDT','10 - 50 pcs','10 - 30 / day','Email : Password']) d=vendorAnswer(d,a);
  expect(d.step).toBe(7);expect(d.products).toEqual([{name:'Canva Pro',duration:'3 Months',warranty:'No Warranty',price:'0.65 USDT',stock:'10 - 50 pcs',capacity:'10 - 30 / day',details:'Email : Password'}]);
  expect(vendorBack(d).step).toBe(6);
  expect(vendorSubmissionSchema.safeParse({...d,note:d.note}).success).toBe(true);
});
test('single product application cannot submit multiple products',()=>{
  const p={name:'Canva',duration:'1 Month',warranty:'Full Warranty',price:'1 USD',stock:'50',capacity:'10/day',details:''};
  expect(vendorSubmissionSchema.safeParse({kind:'application',mode:'single',products:[p,p],note:''}).success).toBe(false);
  expect(vendorSubmissionSchema.safeParse({kind:'application',mode:'multiple',products:[p,p],note:''}).success).toBe(true);
});
test('only active non-banned approved vendors can supply',()=>{
  expect(vendorCanSupply(false,false)).toBe(false);expect(vendorCanSupply(true,true)).toBe(false);expect(vendorCanSupply(true,false)).toBe(true);
});

let active=false;let lastSubmission: any=null;
mock.module('@/integrations/supabase/client.server',()=>({supabaseAdmin:{
  from:(table:string)=>{const chain:any={select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,maybeSingle:async()=>({data:table==='approved_vendors'?{is_active:active}:null,error:null})};return chain;},
  rpc:async(name:string,args:any)=>{lastSubmission={name,args};return {data:'receipt',error:null};},
}}));
const {vendorInteraction}=await import('../../src/lib/bot/vendor.server');
test('bot single and multiple application flow sends durable seven-field snapshot',async()=>{
  for(const mode of ['single','multiple']){
    active=false;let r=await vendorInteraction(123,{},'start:'+mode);
    for(const a of ['Canva Pro','3 Months','No Warranty','0.65 USDT','10 - 50 pcs','10 - 30 / day','Email : Password']) r=await vendorInteraction(123,r.state,null,a);
    if(mode==='multiple'){
      r=await vendorInteraction(123,r.state,'add');
      for(const a of ['Netflix','1 Month','Full Warranty','2 USD','500+ pcs','Weekly Restock','Private Account']) r=await vendorInteraction(123,r.state,null,a);
    }
    r=await vendorInteraction(123,r.state,'note');r=await vendorInteraction(123,r.state,null,'Contact @vendor');
    const submitted=await vendorInteraction(123,r.state,'submit');
    expect(submitted.state['vendor']).toBeNull();expect(lastSubmission.name).toBe('submit_vendor_application');expect(lastSubmission.args.p_telegram_id).toBe(123);expect(lastSubmission.args.p_products.length).toBe(mode==='single'?1:2);expect(lastSubmission.args.p_contact_note).toBe('Contact @vendor');
  }
});
test('approval revocation blocks an already-open supply draft',async()=>{
  active=true;const r=await vendorInteraction(123,{},'start:single');active=false;
  await expect(vendorInteraction(123,r.state,null,'Canva')).rejects.toThrow('approval');
});
test('every wizard keyboard stays inside Telegram limits and stale choices fail',async()=>{
  active=false;let r=await vendorInteraction(123,{},'start:single');
  for(const a of ['Canva','1 Month','No Warranty','1 USD','50','10/day','']){
    expect(r.text.length).toBeLessThanOrEqual(4096);
    for(const row of r.kb){expect(row.length).toBeLessThanOrEqual(8);for(const b of row) expect(new TextEncoder().encode(b.callback_data??'').length).toBeLessThanOrEqual(64);}
    r=await vendorInteraction(123,r.state,null,a);
  }
  await expect(vendorInteraction(123,r.state,'pick:0:0')).rejects.toThrow();
});
test('database denies direct approval, deduplicates submissions and requires approval for supply',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid AND $2='admin' $$; CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$; CREATE TABLE public.bot_users(telegram_id bigint PRIMARY KEY,first_name text,last_name text,username text,is_banned boolean DEFAULT false); INSERT INTO bot_users VALUES(123,'Test','Vendor','vendor',false); CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261121045807_b257fe56-0c38-4512-b04f-cc8b9bb86ea4.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../../supabase/migrations/20261121045835_8d071830-5ff7-4be6-9759-5d332f61a6cb.sql',import.meta.url),'utf8'));
    const p=JSON.stringify([{name:'Canva',duration:'3 Months',warranty:'No Warranty',price:'0.65 USD',stock:'50',capacity:'10/day',details:''}]);
    const submit=async(kind:string,request:string)=>(await db.query<{id:string}>('SELECT submit_vendor_application($1,123,$2,\'single\',$3::jsonb,\'\') AS id',[request,kind,p])).rows[0]?.id;
    await expect(submit('supply','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).rejects.toThrow('approval');
    const id=await submit('application','cccccccc-cccc-cccc-cccc-cccccccccccc');expect(id).toBeDefined();
    expect(await submit('application','cccccccc-cccc-cccc-cccc-cccccccccccc')).toBe(id);
    await expect(db.query('SELECT review_vendor_application($1,true,$2,\'\')',[id,'dddddddd-dddd-dddd-dddd-dddddddddddd'])).rejects.toThrow('Forbidden');
    await db.query('SELECT review_vendor_application($1,true,$2,\'\')',[id,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);
    expect(await submit('supply','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBeDefined();
    const permissions=await db.query<{anon:boolean;authenticated:boolean;service:boolean}>(`SELECT has_function_privilege('anon','review_vendor_application(uuid,boolean,uuid,text)','EXECUTE') AS anon,has_function_privilege('authenticated','review_vendor_application(uuid,boolean,uuid,text)','EXECUTE') AS authenticated,has_function_privilege('service_role','review_vendor_application(uuid,boolean,uuid,text)','EXECUTE') AS service`);
    expect(permissions.rows[0]).toEqual({anon:false,authenticated:false,service:true});
    const tables=await db.query<{rls:boolean}>('SELECT bool_and(relrowsecurity) AS rls FROM pg_class WHERE relname IN (\'vendor_applications\',\'approved_vendors\')');expect(tables.rows[0]?.rls).toBe(true);
  }finally{await db.close();}
},30000);