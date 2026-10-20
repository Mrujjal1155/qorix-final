import { describe, expect, test } from "bun:test";
import { colorIndexesFor, supplierBadgeStyle } from "../../src/lib/supplier-colors";

describe("Supplier colour chips", () => {
  test("each supplier gets its own colour index and blanks are ignored", () => {
    const map = colorIndexesFor(["Vexorix", "Lojinha", "Vexorix", null, "  ", undefined]);
    expect([...map.keys()]).toEqual(["Lojinha", "Vexorix"]);
    expect(map.get("Lojinha")).toBe(0);
    expect(map.get("Vexorix")).toBe(1);
  });
  test("the same supplier always keeps the same colour, whatever the row order is", () => {
    const a = colorIndexesFor(["Routeis", "Vexorix", "Lojinha"]);
    const b = colorIndexesFor(["Vexorix", "Lojinha", "Routeis", "Routeis"]);
    for (const name of ["Lojinha", "Routeis", "Vexorix"]) {
      expect(b.get(name)).toBe(a.get(name));
      expect(supplierBadgeStyle(b.get(name)!)).toEqual(supplierBadgeStyle(a.get(name)!));
    }
    expect(supplierBadgeStyle(a.get("Lojinha")!).color).not.toBe(supplierBadgeStyle(a.get("Vexorix")!).color);
  });
  test("surrounding spaces do not split one supplier into two colours", () => {
    const map = colorIndexesFor([" Vexorix ", "Vexorix"]);
    expect(map.size).toBe(1);
    expect(map.get("Vexorix")).toBe(0);
  });
});
