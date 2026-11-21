import { expect, test } from "bun:test";
import { browserPaymentInput, browserPaymentOpen, browserPaymentUrl, browserOrderRows, checkoutPaymentMethods } from "../../src/lib/bot/browser-payment";

test("bot checkout offers Wallet, Direct Payment, Stars in that exact order", () => {
  expect(checkoutPaymentMethods(true)).toEqual(["balance", "browser", "stars"]);
  expect(checkoutPaymentMethods(false)).toEqual(["balance", "browser"]);
});
test("browser payment closes at exactly 30 minutes, even with a later stored expiry", () => {
  const created = "2026-11-21T13:00:00Z";
  const row = { status: "pending", created_at: created, expires_at: "2026-11-21T14:00:00Z" };
  expect(browserPaymentOpen(row, Date.parse("2026-11-21T13:29:59Z"))).toBe(true);
  expect(browserPaymentOpen(row, Date.parse("2026-11-21T13:30:00Z"))).toBe(false);
});
test("cancelled links cannot start payments", () => {
  expect(browserPaymentOpen({ status: "cancelled", created_at: "2026-11-21T13:00:00Z", expires_at: "2026-11-21T13:30:00Z" }, Date.parse("2026-11-21T13:01:00Z"))).toBe(false);
});
test("payment link uses a 256-character-bounded fragment, with no buyer/product/amount query inputs", () => {
  const token = "a".repeat(64);
  const url = new URL(browserPaymentUrl("https://qorixlab.com", token));
  expect(url.pathname).toBe("/pay"); expect(url.search).toBe(""); expect(url.hash).toBe(`#${token}`);
  expect(url.href.length).toBeLessThanOrEqual(256);
  expect(() => browserPaymentUrl("http://qorixlab.com", token)).toThrow();
  expect(browserPaymentInput.safeParse({ token: "1042" }).success).toBe(false);
});
test("original order rows retain quantity and the exact 2 dollar total after discount allocation", () => {
  const rows = browserOrderRows([1, 2, 3].map(i => ({ product: { id: String(i), name: "Product", delivery_type: "auto" }, qty: 5, unit: 0.2, subtotal: 1 })), 2, null);
  expect(rows.map(r => r.quantity)).toEqual([5, 5, 5]);
  expect(rows.map(r => r.total)).toEqual([0.67, 0.67, 0.66]);
  expect(Math.round(rows.reduce((s, r) => s + r.total, 0) * 100)).toBe(200);
});