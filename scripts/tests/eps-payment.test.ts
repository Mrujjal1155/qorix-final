import { expect, test } from "bun:test";
import { epsMerchantAmount, epsWalletCredit } from "../../src/lib/eps-payment";
import { orderTimezone } from "../../src/lib/order-time";
import { reservedCheckout } from "../../src/lib/bot/paid-checkout";

test("EPS receipt excludes the 13.29 BDT payer fee from merchant funds", () => {
  expect(epsMerchantAmount({ StoreAmount: 664.35, TotalAmount: 677.64 })).toBe(664.35);
});
test("verified EPS payment credits the requested 5.15 USD, never 5.25", () => {
  expect(epsWalletCredit(5.15, 664.35, 664.35)).toBe(5.15);
  expect(epsWalletCredit(5.15, 677.64, 664.35)).toBe(5.15);
});
test("EPS merchant underpayment cannot be covered by payer fees", () => {
  expect(() => epsWalletCredit(5.15, epsMerchantAmount({ StoreAmount: 660, TotalAmount: 677.64 }), 664.35)).toThrow();
});
const order = { id: "o1", product_id: "p1", quantity: 1, unit_price: 5.15, total: 5.15, discount: 0,
  product_name: "Lovable Lite 12M Account", status: "cancelled", meta: {} };
test("late paid cancelled checkout keeps its original price after catalogue changes", () => {
  const result = reservedCheckout([order], [{ id: "p1", price: 5.80, is_active: true }], [{ product_id: "p1", qty: 1 }]);
  expect(result.blocked).toBe(false);
  expect(result.total).toBe(5.15);
  expect(result.lines[0]?.unit).toBe(5.15);
});
test("inactive checkout remains accounted for instead of becoming a zero-dollar purchase", () => {
  const result = reservedCheckout([order], [{ id: "p1", is_active: false }], [{ product_id: "p1", qty: 1 }]);
  expect(result.blocked).toBe(true);
  expect(result.total).toBe(5.15);
  expect(result.lines).toHaveLength(1);
});
test("missing checkout products block delivery rather than silently dropping a line", () => {
  expect(reservedCheckout([order], [], [{ product_id: "p1", qty: 1 }]).blocked).toBe(true);
});
test("same UTC order instant displays as 14:27 in Dhaka not 13:27 Karachi", () => {
  const zone = orderTimezone();
  expect(zone).toBe("Asia/Dhaka");
  expect(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date("2026-10-24T08:27:16Z"))).toBe("14:27");
});