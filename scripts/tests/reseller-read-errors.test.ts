import { expect, mock, test } from "bun:test";
let errorMode = true;
let seenLimit = 0;
mock.module("@tanstack/react-router", () => ({ createFileRoute: () => (options: any) => options }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    const result = () => table === "resellers" ? {data:{id:"fixture",is_active:true,balance:10,allow_website:true,allow_bot:true},error:null} : {data:null,error:errorMode?{message:"private diagnostic"}:null};
    const q:any={select:()=>q,eq:()=>q,or:()=>q,order:()=>q,update:()=>q,limit:(n:number)=>{seenLimit=n;return q;},maybeSingle:async()=>result(),then:(r:any,j:any)=>Promise.resolve(result()).then(r,j)};return q;
  },
}}));
const { Route: orders }=await import("../../src/routes/api/public/reseller/v1/orders");
const { Route: detail }=await import("../../src/routes/api/public/reseller/v1/orders.$id");
const { Route: tx }=await import("../../src/routes/api/public/reseller/v1/transactions");
const request=(path:string)=>new Request("http://localhost"+path,{headers:{authorization:"Bearer fixture"}});
test("history/detail/ledger read failures return 503, not empty success or false 404",async()=>{
  for(const [route,path,params] of [[orders,"/orders?limit=Infinity",{}],[detail,"/orders/test",{id:"test"}],[tx,"/transactions",{}]] as any[]) {
    const response=await route.server.handlers.GET({request:request(path),params});
    expect(response.status).toBe(503);const body=await response.json();
    expect(body.ok).toBe(false);expect(JSON.stringify(body)).not.toContain("private diagnostic");
  }
});
test("valid empty history stays success and invalid limit defaults to 50",async()=>{
  errorMode=false;
  const response=await (orders as any).server.handlers.GET({request:request("/orders?limit=invalid")});
  expect(response.status).toBe(200);expect(seenLimit).toBe(50);
  expect(await response.json()).toEqual({ok:true,orders:[]});
});
test("null JSON returns controlled 400 before purchase",async()=>{
  const response=await (orders as any).server.handlers.POST({request:new Request("http://localhost/orders",{method:"POST",headers:{"content-type":"application/json"},body:"null"})});
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ok:false,error:"JSON body must be an object"});
});