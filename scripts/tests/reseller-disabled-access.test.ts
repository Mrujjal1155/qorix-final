import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// A disabled reseller must be refused on every endpoint immediately — no cached
// authorization may keep serving product data after access is switched off.
test("no reseller endpoint uses cached authorization", () => {
  for (const f of ["products.$id", "products", "orders", "orders.$id", "me", "transactions"]) {
    const src = readFileSync(`src/routes/api/public/reseller/v1/${f}.ts`, "utf8");
    expect(src.includes("cached: true")).toBe(false);
  }
});

test("missing email key warning never logs the recipient", () => {
  const src = readFileSync("src/lib/email/resend.server.ts", "utf8");
  expect(src).not.toMatch(/console\.\w+\([^)]*input\.to/);
});
