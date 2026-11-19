import { describe, expect, test } from "bun:test";
import { usdToStars, starsPerUsd, parseStarsPayload, starsPayload } from "../../src/lib/stars-payment";

describe("Telegram Stars pricing", () => {
  test("default rate is 77 Stars per $1", () => expect(starsPerUsd({})).toBe(77));
  test("$1 costs 77 Stars", () => expect(usdToStars(1, 77)).toBe(77));
  test("1 cent is payable with 1 Star", () => expect(usdToStars(0.01, 77)).toBe(1));
  test("5 cents rounds up to 4 Stars", () => expect(usdToStars(0.05, 77)).toBe(4));
  test("admin override is used", () => expect(starsPerUsd({ stars_per_usd: "100" })).toBe(100));
  test("payload round-trips deposit id", () => { const id = "11111111-2222-3333-4444-555555555555"; expect(parseStarsPayload(starsPayload(id))).toBe(id); expect(parseStarsPayload("x")).toBeNull(); });
});
