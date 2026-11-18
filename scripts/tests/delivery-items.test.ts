import { describe, expect, it } from "bun:test";
import { deliveryItems, showItemsSingly } from "../../src/lib/delivery-items";

describe("delivery items", () => {
  it("splits saved delivery on --- lines", () => {
    expect(deliveryItems("a:1\n---\nb:2\n---\nc:3")).toEqual(["a:1", "b:2", "c:3"]);
  });
  it("shows up to 5 items one by one", () => {
    expect(showItemsSingly(1)).toBe(true);
    expect(showItemsSingly(5)).toBe(true);
  });
  it("sends 6 or more as one TXT file", () => {
    expect(showItemsSingly(6)).toBe(false);
    expect(showItemsSingly(10)).toBe(false);
  });
});
