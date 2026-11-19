import { test, expect } from "bun:test";
import { checkoutCustomer } from "../../src/lib/checkout-customer";

test("Telegram-connected checkout accepts empty name and email with verified ownership", () => {
  const r = checkoutCustomer({ userId: "verified-user", telegramId: 12345 }, { customer_name: "", customer_email: "" });
  expect(r.telegram_id).toBe(12345);
  expect(r.user_id).toBe("verified-user");
  expect(r.customer_email).toBe("tg12345@telegram.qorixlab.com");
});
test("guest checkout still requires name and email", () => {
  expect(() => checkoutCustomer(null, { customer_name: "", customer_email: "" })).toThrow("Name is required");
  expect(() => checkoutCustomer(null, { customer_name: "Guest", customer_email: "" })).toThrow("Valid email is required");
});
test("unavailable Telegram account cannot order", () => {
  expect(() => checkoutCustomer({ userId: "u", telegramId: 12345, banned: true }, { customer_name: "", customer_email: "" })).toThrow("unavailable");
});