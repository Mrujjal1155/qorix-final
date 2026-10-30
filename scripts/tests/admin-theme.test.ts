import { expect, test } from "bun:test";
import { adminThemeClass, resolveAdminTheme } from "../../src/lib/admin-theme";

test("admin can select either previous or DarkPan theme", () => {
  expect(resolveAdminTheme("legacy")).toBe("legacy");
  expect(resolveAdminTheme("darkpan")).toBe("darkpan");
});

test("missing or invalid stored choices default to DarkPan", () => {
  expect(resolveAdminTheme(null)).toBe("darkpan");
  expect(resolveAdminTheme("invalid-css-class")).toBe("darkpan");
});
test("admin can select the white theme and it drops the dark class", () => {
  expect(resolveAdminTheme("light")).toBe("light");
  expect(adminThemeClass("light").split(" ")).not.toContain("dark");
  expect(adminThemeClass("darkpan").split(" ")).toContain("dark");
});
