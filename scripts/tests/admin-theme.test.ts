import { expect, test } from "bun:test";
import { resolveAdminTheme } from "../../src/lib/admin-theme";

test("admin can select either previous or DarkPan theme", () => {
  expect(resolveAdminTheme("legacy")).toBe("legacy");
  expect(resolveAdminTheme("darkpan")).toBe("darkpan");
});

test("missing or invalid stored choices default to DarkPan", () => {
  expect(resolveAdminTheme(null)).toBe("darkpan");
  expect(resolveAdminTheme("invalid-css-class")).toBe("darkpan");
});