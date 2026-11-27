import { expect, test } from "bun:test";
import { normalizeInputFields, validateCustomerInputs } from "../../src/lib/reseller/customer-inputs";

const emailOnly = normalizeInputFields([{ key: "canva_account_email", label: "Canva email", type: "email", required: true }]).fields;

test("bad configuration is reported invalid", () => {
  expect(normalizeInputFields([{ key: "Bad Key", label: "x", type: "email" }]).valid).toBe(false);
  expect(normalizeInputFields([{ key: "a", label: "x", type: "color" }]).valid).toBe(false);
  expect(normalizeInputFields([]).valid).toBe(true);
});

test("single email field accepts email alias and top-level email", () => {
  expect(validateCustomerInputs(emailOnly, { email: "b@x.com" })).toEqual({ ok: true, values: { canva_account_email: "b@x.com" } });
  expect(validateCustomerInputs(emailOnly, undefined, "c@x.com")).toEqual({ ok: true, values: { canva_account_email: "c@x.com" } });
});

test("required, unknown, non-string and invalid values are rejected", () => {
  expect(validateCustomerInputs(emailOnly, {}).ok).toBe(false);
  expect(validateCustomerInputs(emailOnly, { email: "b@x.com", extra: "1" }).ok).toBe(false);
  expect(validateCustomerInputs(emailOnly, { canva_account_email: 5 }).ok).toBe(false);
  expect(validateCustomerInputs(emailOnly, { canva_account_email: "nope" }).ok).toBe(false);
});

test("username, phone and text are normalized by the documented rules", () => {
  const f = normalizeInputFields([
    { key: "user", label: "U", type: "username" },
    { key: "phone", label: "P", type: "phone" },
    { key: "note", label: "N", type: "text", required: false },
  ]).fields;
  expect(validateCustomerInputs(f, { user: "@john_d", phone: "+880 1711 000000" })).toEqual({ ok: true, values: { user: "john_d", phone: "+8801711000000" } });
  expect(validateCustomerInputs(f, { user: "ab", phone: "+8801711000000" }).ok).toBe(false);
  expect(validateCustomerInputs(f, { user: "john", phone: "12" }).ok).toBe(false);
  expect(validateCustomerInputs(f, { user: "john", phone: "1234567", note: "x".repeat(201) }).ok).toBe(false);
});
