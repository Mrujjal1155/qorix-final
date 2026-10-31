import { describe, expect, it } from "vitest";
import { categoryNameSchema, categoryOrderSchema, moveCategoryToPosition } from "../../src/lib/category-edit";

describe("category editing", () => {
  it("moves serial 3 to 1 and shifts the other categories without losing any", () => {
    expect(moveCategoryToPosition(["a", "b", "c", "d"], "c", "1")).toEqual(["c", "a", "b", "d"]);
  });
  it("moves serial 1 to 4 and retains the order of other categories", () => {
    expect(moveCategoryToPosition(["a", "b", "c", "d"], "a", "4")).toEqual(["b", "c", "d", "a"]);
  });
  it("rejects blank, fractional, zero and out-of-range serials", () => {
    for (const value of ["", "1.5", "0", "5", "-1", "abc"]) expect(() => moveCategoryToPosition(["a", "b", "c", "d"], "a", value)).toThrow();
  });
  it("requires a nonblank name and trims it", () => {
    expect(categoryNameSchema.parse(" Muse AI ")).toBe("Muse AI");
    expect(categoryNameSchema.safeParse("  ").success).toBe(false);
  });
  it("rejects duplicate category ids on the server", () => {
    const id = "1e41be77-029a-4e1a-a6e3-a7ae8c674cec";
    expect(categoryOrderSchema.safeParse({ ids: [id, id] }).success).toBe(false);
  });
});