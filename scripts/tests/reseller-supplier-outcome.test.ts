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