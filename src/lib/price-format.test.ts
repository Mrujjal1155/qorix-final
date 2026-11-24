import { describe, it, expect } from "vitest";
import { usdPrice } from "./price-format";
describe("usdPrice", () => {
  it("shows 0.025 exactly", () => expect(usdPrice(0.025)).toBe("$0.025"));
  it("keeps two decimals for normal prices", () => expect(usdPrice(3)).toBe("$3.00"));
});
