import { describe, expect, test } from "bun:test";
import { selectListProducts, productListBatch } from "../../src/lib/product-list";
const rows = [{id:"a",category_id:"gemini",supplier_id:null},{id:"b",category_id:"other",categoryIds:["gemini"],supplier_id:"supplier"},{id:"c",category_id:"other",supplier_id:null}];
describe("Price list selection", () => {
  test("category includes direct and additional category memberships only", () => {
    expect(selectListProducts(rows,"category","gemini").map(p=>p.id)).toEqual(["a","b"]);
  });
  test("admin selections survive supplier filters and retain click order", () => {
    expect(selectListProducts(rows,"selected",undefined,["b","a","b"]).map(p=>p.id)).toEqual(["b","a"]);
  });
  test("selected lists still preview at most 40 products", () => {
    const products=Array.from({length:41},(_,i)=>({id:String(i)}));
    expect(productListBatch(selectListProducts(products,"selected",undefined,products.map(p=>p.id))).products.length).toBe(40);
  });
  test("removed or inactive rows absent from loaded active catalogue never reappear", () => {
    expect(selectListProducts(rows,"selected",undefined,["missing","a"]).map(p=>p.id)).toEqual(["a"]);
  });
});