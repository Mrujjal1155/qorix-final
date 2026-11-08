import { expect, test, mock } from "bun:test";
import { supplierOrder } from "../../src/lib/suppliers/api.server";

const supplier = { id:"fixture",key:"primelabs",name:"Private fixture",base_url:"https://supplier.example.invalid/api/v1",api_key:"fixture-not-a-real-key" };
test("supplier rejection is explicit regardless of response text; network outcome stays unknown", async () => {
  const original=globalThis.fetch;
  try {
    globalThis.fetch=mock(async () => new Response(JSON.stringify({ ok:false,error:"any language or message" }),{ status:409 })) as any;
    try { await supplierOrder(supplier,"1",1,"fixture-order"); throw new Error("Expected rejection"); }
    catch(error) { expect((error as any).deliveryOutcome).toBe("rejected"); }
    globalThis.fetch=mock(async () => { throw new Error("arbitrary transport failure"); }) as any;
    try { await supplierOrder(supplier,"1",1,"fixture-order"); throw new Error("Expected transport failure"); }
    catch(error) { expect((error as any).deliveryOutcome).not.toBe("rejected"); }
  } finally { globalThis.fetch=original; }
});
test("unknown action-style purchase never falls through to another host", async () => {
  const original=globalThis.fetch; let calls=0;
  try {
    globalThis.fetch=mock(async () => { calls++; throw new Error("unrecognized lost response"); }) as any;
    await expect(supplierOrder({...supplier,key:"vexoran",base_url:"https://configured.example.invalid"},"1",1,"fixture-order")).rejects.toThrow("unrecognized lost response");
    expect(calls).toBe(1);
  } finally { globalThis.fetch=original; }
});
test("write rate limit never automatically repeats the purchase", async () => {
  const original=globalThis.fetch; let calls=0;
  try {
    globalThis.fetch=mock(async () => { calls++; return new Response(JSON.stringify({ok:false,code:"RATE_LIMITED"}),{status:429}); }) as any;
    await expect(supplierOrder(supplier,"1",1,"fixture-order")).rejects.toThrow();
    expect(calls).toBe(1);
  } finally { globalThis.fetch=original; }
});