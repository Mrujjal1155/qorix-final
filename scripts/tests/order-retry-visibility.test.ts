import { expect, test } from "bun:test";
import { canRetryInhouseOrder } from "../../src/lib/order-retry";

const ownStock = { status: "pending", delivery_type: "auto", supplier_name: null };
const paid = { paid: true, refunded: false };

test("completed in-house orders have no retry action", () => {
  expect(canRetryInhouseOrder({ ...ownStock, status: "completed" }, paid)).toBe(false);
});

test("paid pending in-house orders can retry", () => {
  expect(canRetryInhouseOrder(ownStock, paid)).toBe(true);
  expect(canRetryInhouseOrder(ownStock, { ...paid, paid: false })).toBe(false);
});

test("blocked or failed delivery only retries after payment", () => {
  for (const status of ["blocked", "failed"]) {
    expect(canRetryInhouseOrder({ ...ownStock, status }, paid)).toBe(true);
    expect(canRetryInhouseOrder({ ...ownStock, status }, { ...paid, paid: false })).toBe(false);
  }
});

test("other states and refunded payments cannot retry", () => {
  for (const status of ["awaiting_payment", "cancelled", "refunded", "processing", "preorder"]) {
    expect(canRetryInhouseOrder({ ...ownStock, status }, paid)).toBe(false);
  }
  expect(canRetryInhouseOrder(ownStock, { ...paid, refunded: true })).toBe(false);
});

test("in-house retry is not a supplier or manual delivery action", () => {
  expect(canRetryInhouseOrder({ ...ownStock, supplier_name: "Supplier" }, paid)).toBe(false);
  expect(canRetryInhouseOrder({ ...ownStock, delivery_type: "manual" }, paid)).toBe(false);
});