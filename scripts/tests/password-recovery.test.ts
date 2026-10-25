import { expect, test } from "bun:test";
import { isPasswordRecoveryHash, saveRecoveryPassword } from "../../src/lib/password-recovery";

test("only recovery links enable the recovery form", () => {
  expect(isPasswordRecoveryHash("#access_token=example&type=recovery")).toBe(true);
  expect(isPasswordRecoveryHash("#access_token=example&type=signup")).toBe(false);
  expect(isPasswordRecoveryHash("")).toBe(false);
});

test("mismatched passwords cannot update the account", async () => {
  let calls = 0;
  await expect(saveRecoveryPassword({ updateUser: async () => { calls++; return { error: null }; } }, "abcdef", "different")).rejects.toThrow();
  expect(calls).toBe(0);
});

test("recovery update sends only the new password, never current_password", async () => {
  const calls: unknown[] = [];
  await saveRecoveryPassword({ updateUser: async (attributes) => { calls.push(attributes); return { error: null }; } }, "new-password", "new-password");
  expect(calls).toEqual([{ password: "new-password" }]);
});

test("provider failure does not report a saved password", async () => {
  await expect(saveRecoveryPassword({ updateUser: async () => ({ error: { message: "Expired recovery" } }) }, "abcdef", "abcdef")).rejects.toThrow("Expired recovery");
});