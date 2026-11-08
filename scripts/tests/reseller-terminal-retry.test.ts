import { expect, mock, test } from "bun:test";
let current: any;
let productReads=0;
mock.module("@/integrations/supabase/client.server",()=>({ supabaseAdmin:{
  from(table:string) {
    if(table!=="orders") productReads++;
    const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:current,error:null})};return q;
  },
}}));
const { retrySupplierDelivery }=await import("../../src/lib/suppliers/fulfil.server");
test("terminal reseller orders stop before stock, supplier or delivery calls",async()=>{
  for(const status of ["failed","cancelled","expired","refunded"]) {
    current={reseller_id:"fixture",status,meta:{refunded:status==="failed"}};
    expect((await retrySupplierDelivery("fixture-order")).ok).toBe(false);
  }
  expect(productReads).toBe(0);
});