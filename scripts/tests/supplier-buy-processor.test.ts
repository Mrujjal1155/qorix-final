import { expect, test } from 'bun:test';
import { processBuyOrders } from '../../src/lib/suppliers/buy-orders.server';
import { BuyRejected } from '../../src/lib/suppliers/buy-api.server';

function fixture() {
  const order:any={id:'o',supplier_id:'s',external_id:'p',target:50,acquired:0,status:'watching',quantity_choices:[50,40,35]};
  const batches:any[]=[];
  const db:any={from(table:string){
    const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,update:()=>q,maybeSingle:async()=>({data:{key:'digitalcore',base_url:'https://digitalcore.top',is_enabled:true}}),then(resolve:any){return Promise.resolve({data:table==='supplier_buy_orders'?(order.status==='watching'?[order]:[]):batches.filter(b=>b.status==='rejected')}).then(resolve);}};
    return q;
  },async rpc(name:string,p:any){
    if(name==='record_supplier_buy_check')return {data:order.status==='watching'};
    if(name==='claim_supplier_buy_batch'){
      if(order.status!=='watching')return {data:null};
      const b={id:String(batches.length),quantity:p.p_qty,status:'submitted'};batches.push(b);order.status='purchasing';return {data:b.id};
    }
    const b=batches.find(x=>x.id===p.p_batch);b.status=p.p_status;order.acquired+=p.p_items.length;
    order.status=p.p_status==='completed'?'completed':p.p_status==='unknown'?'review':p.p_message==='OUT_OF_STOCK'&&b.quantity>35?'watching':'paused';
    return {data:null};
  }};
  return {db,order,batches};
}

test('processor switches from 50 to 40 on stock 45, buys once and never fills remainder',async()=>{
  const f=fixture(),calls:number[]=[];
  const request:any=async(_s:any,path:string,body:any)=>{if(path.startsWith('product'))return {id:'p',stock:45};calls.push(body.count);return {items:Array(body.count).fill('account')};};
  expect(await processBuyOrders(f.db,request)).toEqual({checks:1,purchases:1});await processBuyOrders(f.db,request);
  expect(calls).toEqual([40]);expect(f.order.acquired).toBe(40);expect(f.order.status).toBe('completed');
});
test('processor sends no purchase at stock 34',async()=>{
  const f=fixture(),calls:number[]=[];const request:any=async(_s:any,path:string,body:any)=>{if(path.startsWith('product'))return {id:'p',stock:34};calls.push(body.count);};
  expect(await processBuyOrders(f.db,request)).toEqual({checks:1,purchases:0});expect(calls).toEqual([]);expect(f.order.status).toBe('watching');
});
test('definitive stock rejection immediately falls 50 then 40 then 35, no fourth call',async()=>{
  const f=fixture(),calls:number[]=[];const request:any=async(_s:any,path:string,body:any)=>{if(path.startsWith('product'))return {id:'p',stock:50};calls.push(body.count);throw new BuyRejected('OUT_OF_STOCK');};
  await processBuyOrders(f.db,request);await processBuyOrders(f.db,request);expect(calls).toEqual([50,40,35]);expect(f.order.status).toBe('paused');
});
test('uncertain purchase never falls back or retries on another tick',async()=>{
  const f=fixture(),calls:number[]=[];const request:any=async(_s:any,path:string,body:any)=>{if(path.startsWith('product'))return {id:'p',stock:50};calls.push(body.count);throw new Error('timeout');};
  await processBuyOrders(f.db,request);await processBuyOrders(f.db,request);expect(calls).toEqual([50]);expect(f.order.status).toBe('review');
});
test('balance rejection never shifts to a smaller purchase',async()=>{
  const f=fixture(),calls:number[]=[];const request:any=async(_s:any,path:string,body:any)=>{if(path.startsWith('product'))return {id:'p',stock:50};calls.push(body.count);throw new BuyRejected('INSUFFICIENT_BALANCE');};
  await processBuyOrders(f.db,request);expect(calls).toEqual([50]);expect(f.order.status).toBe('paused');
});