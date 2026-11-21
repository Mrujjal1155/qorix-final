import { expect, test } from "bun:test";
import { trackingProjection, trackingQuery } from "../../src/lib/order-tracking";

test("tracking accepts order number 1042 alone", () => {
  expect(trackingQuery("1042")).toEqual({ kind: "number", value: "1042" });
});
test("tracking accepts QX-93ru3 alone and existing ORD codes", () => {
  expect(trackingQuery("QX-93ru3")).toEqual({ kind: "code", value: "QX-93RU3" });
  expect(trackingQuery("ORD-79192548").kind).toBe("code");
});
test("tracking accepts an email without requiring an order number", () => {
  expect(trackingQuery("Buyer@example.com")).toEqual({ kind: "email", value: "buyer@example.com" });
});
test("tracking rejects wildcard and injected lookups", () => {
  for (const input of ["", "%", "1042 OR 1=1", "QX-%", "0", "abc", "a".repeat(161)]) expect(() => trackingQuery(input)).toThrow();
});
test("ID or email knowledge alone cannot expose purchased product, amount or credentials", () => {
  const row = { order_no: 1042, order_code: "QX-93RU3", status: "completed", product_name: "Private purchase", quantity: 2, total: 4, delivered_content: "secret:password", customer_email: "buyer@example.com", meta: { supplier_key: "private" } };
  expect(trackingProjection(row, false)).toEqual({ order_no: 1042, order_code: "QX-93RU3", status: "completed", locked: true, product_name: null, quantity: null, total: null, delivered_content: null });
  expect(trackingProjection(row, true).delivered_content).toBe("secret:password");
  expect(trackingProjection(row, true)).not.toHaveProperty("customer_email");
  expect(trackingProjection(row, true)).not.toHaveProperty("meta");
});