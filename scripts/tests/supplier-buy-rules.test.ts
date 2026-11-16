import { describe, expect, it } from 'bun:test';
import { buyBatchQuantity, buyItemsText, buyOutcome, supportsBuyWatch } from '../../src/lib/supplier-buy-rules';
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