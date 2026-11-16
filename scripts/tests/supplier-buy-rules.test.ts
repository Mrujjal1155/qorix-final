import { describe, expect, it } from 'bun:test';
import { buyBatchQuantity, buyItemsText, buyOutcome, supportsBuyWatch, chooseBuyQuantity, validBuyChoices, readAllBuyProducts } from '../../src/lib/supplier-buy-rules';
import { buyApi, BuyRejected } from '../../src/lib/suppliers/buy-api.server';

describe('supplier buy quantities',()=>{
  it('50 available buys all 50 in one batch',()=>expect(buyBatchQuantity(50,50)).toBe(50));
  it('35 available buys 30',()=>expect(buyBatchQuantity(35,50)).toBe(30));
  it('25 available buys 20',()=>expect(buyBatchQuantity(25,50)).toBe(20));
  it('15 available buys 15',()=>expect(buyBatchQuantity(15,50)).toBe(15));
  it('never exceeds remaining target',()=>expect(buyBatchQuantity(100,20)).toBe(20));
  it('completed order buys nothing',()=>expect(buyBatchQuantity(100,0)).toBe(0));
  it('waits for fewer than five unless finishing',()=>{expect(buyBatchQuantity(4,50)).toBe(0);expect(buyBatchQuantity(4,4)).toBe(4);});
  it('honors DigitalCore maximum 1000 per purchase',()=>expect(buyBatchQuantity(5000,5000)).toBe(1000));
  it('partial delivery is uncertain',()=>expect(buyOutcome(['account'],2)).toBe('unknown'));
  it('preserves delivered text',()=>expect(buyItemsText([{items:['a\r\nb','c']}])).toBe('a\r\nb\nc'));
  it('only verified adapter can auto buy',()=>{expect(supportsBuyWatch('digitalcore','https://digitalcore.top')).toBe(true);expect(supportsBuyWatch('other','https://other.test')).toBe(false);});
});

const supplier={id:'s',key:'digitalcore',name:'Test',base_url:'https://digitalcore.top',api_key:'test-only'};
describe('three admin quantity choices',()=>{
  it('50 stock buys the first 50',()=>expect(chooseBuyQuantity(50,[50,40,35])).toEqual({quantity:50,checked:[50]}));
  it('45 stock switches immediately to 40',()=>expect(chooseBuyQuantity(45,[50,40,35])).toEqual({quantity:40,checked:[50,40]}));
  it('38 stock switches to the last 35',()=>expect(chooseBuyQuantity(38,[50,40,35])).toEqual({quantity:35,checked:[50,40,35]}));
  it('34 stock never buys below 35',()=>expect(chooseBuyQuantity(34,[50,40,35])).toEqual({quantity:0,checked:[50,40,35]}));
  it('confirmed rejection moves only downward',()=>{expect(chooseBuyQuantity(60,[50,40,35],[50]).quantity).toBe(40);expect(chooseBuyQuantity(60,[50,40,35],[40]).quantity).toBe(35);expect(chooseBuyQuantity(60,[50,40,35],[35]).quantity).toBe(0);});
  it('requires three decreasing integer choices',()=>{expect(validBuyChoices([50,40,35])).toBe(true);for(const c of [[50,50,35],[50,35,40],[50,40],[50,40,0],[1001,40,35],[50,40,3.5]])expect(validBuyChoices(c)).toBe(false);});
  it('includes sold-out products beyond the first 1000',async()=>{
    const rows=Array.from({length:1201},(_,i)=>({id:String(i),name:i===1200?'Lovable Pro Lite':'Product',stock:0,supplier_id:'digitalcore'}));
    const filters:any[]=[];const pages:any[]=[];
    const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push([k,v]);return q;},order:()=>q,range:async(a:number,b:number)=>{pages.push([a,b]);return {data:rows.slice(a,b+1)};}};
    const result=await readAllBuyProducts({from:()=>q},'digitalcore');
    expect(result).toHaveLength(1201);expect(result.find(p=>p.name==='Lovable Pro Lite')?.id).toBe('1200');expect(pages).toEqual([[0,499],[500,999],[1000,1499]]);expect(filters).toContainEqual(['supplier_id','digitalcore']);expect(filters).toContainEqual(['stock',0]);
  });
});
describe('one-shot supplier API',()=>{
  it('one bulk purchase without price or balance checks',async()=>{
    const requests: {url:string,body:any}[]=[];
    const fake=(async(url:any,init:any)=>{requests.push({url:String(url),body:JSON.parse(init.body)});return Response.json({success:true,items:Array(50).fill('test')});}) as typeof fetch;
    await buyApi(supplier,'buy',{id:'product',count:50},fake);
    expect(requests).toEqual([{url:'https://digitalcore.top/api/user/buy',body:{id:'product',count:50}}]);
  });
  it('network uncertainty never retries',async()=>{
    let calls=0;
    const fake=(async()=>{calls++;throw new Error('Network failed');}) as typeof fetch;
    await expect(buyApi(supplier,'buy',{id:'p',count:50},fake)).rejects.toThrow('Network failed');expect(calls).toBe(1);
  });
  it('only documented explicit rejection is a rejected purchase',async()=>{
    const fake=(async()=>Response.json({success:false,msg:'OUT_OF_STOCK'},{status:400})) as typeof fetch;
    await expect(buyApi(supplier,'buy',{id:'p',count:50},fake)).rejects.toBeInstanceOf(BuyRejected);
  });
  it('redirect never follows or retries',async()=>{
    let calls=0;let redirect='';
    const fake=(async(_u:any,i:any)=>{calls++;redirect=i.redirect;return new Response('',{status:302,headers:{Location:'https://other.test'}});}) as typeof fetch;
    await expect(buyApi(supplier,'buy',{id:'p',count:50},fake)).rejects.toThrow();expect(calls).toBe(1);expect(redirect).toBe('manual');
  });
});