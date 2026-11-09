import { describe, expect, it } from "bun:test";
import { usdToBdt } from "../../src/lib/eps.server";

describe("BDT gateway whole-taka rounding", () => {
  it("rounds 50 paisa up to the next taka", () => expect(usdToBdt(5.3, 129)).toBe(684));
  it("rounds 30 paisa up to the next taka", () => expect(usdToBdt(0.78, 129)).toBe(101));
  it("keeps whole taka unchanged", () => expect(usdToBdt(1, 129)).toBe(129));
});
