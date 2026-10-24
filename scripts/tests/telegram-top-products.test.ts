import { describe, expect, test } from "bun:test";
import { IN_HOUSE_FILTER, countBySupplier, filterCatalogue, parseTopProductIds, selectTopProducts, sortTelegramTopProducts, telegramFavoritesPage } from "../../src/lib/telegram-top-products";

describe("Admin-selected Telegram top products", () => {
  const products = [{ id: "a", price: 1.2, stock: 4, featured_rank: 0 }, { id: "b", price: 2, stock: 5, featured_rank: 1 }];
  test("only explicit selections appear, in selection order, not automatic featured ranking", () => {
    expect(selectTopProducts(products, ["b", "a"]).map((p) => p.id)).toEqual(["b", "a"]);
    expect(selectTopProducts(products, ["a"]).map((p) => p.id)).toEqual(["a"]);
    expect(selectTopProducts(products, [])).toEqual([]);
  });
  test("deleted, unavailable and duplicate selections do not add extra products", () => {
    expect(selectTopProducts(products, ["missing", "a", "a"]).map((p) => p.id)).toEqual(["a"]);
  });
  test("retains the user's effective single-unit price and current stock without modifying pricing", () => {
    expect(selectTopProducts(products, ["a"])[0]).toBe(products[0]);
    expect(selectTopProducts(products, ["a"])[0]?.price).toBe(1.2);
    expect(selectTopProducts(products, ["a"])[0]?.stock).toBe(4);
  });
  test("saved picks round-trip and empty save clears the selection", () => {
    expect(parseTopProductIds(JSON.stringify(["b", "a"]))).toEqual(["b", "a"]);
    expect(parseTopProductIds("[]")).toEqual([]);
    expect(parseTopProductIds("invalid")).toEqual([]);
    expect(parseTopProductIds('["a","a",7]')).toEqual(["a"]);
  });
});

describe("Telegram favorite brand and credit order", () => {
  test("all selected Gemini including new additions precede Lovable and other products", () => {
    const products = [{ id: "other", name: "Notion" }, { id: "lovable", name: "Lovable 100 Credit" }, { id: "gemini", name: "Gemini Pro 3 Months" }, { id: "new", name: " Gemini AI Pro 18m NEW" }];
    expect(selectTopProducts(products, ["other", "lovable", "gemini", "new"]).map((p) => p.id)).toEqual(["gemini", "new", "lovable", "other"]);
    expect(selectTopProducts(products, ["other", "lovable"]).map((p) => p.id)).toEqual(["lovable", "other"]);
  });
  test("Lovable credits are ordered 100, 300, 305, 2k, 5k, 10k, 20k, not by duration or price", () => {
    const names = ["Lovable 20k Credits 7 DW", "Lovable Pro 10k Credits(NW)", "Lovable 5k Credits 7DW", "Lovable 2k Credits 7 DW", "Lovable PRO Lite 305 Credit 12M", "Lovable Pro Lite 12 months + 300 credits", "Lovable PRO 1M 100 Credit NW"];
    expect(sortTelegramTopProducts(names.map((name, i) => ({ name, price: i }))).map((p) => p.name)).toEqual([...names].reverse());
  });
  test("comma-separated and attached credit quantities sort numerically", () => {
    expect(sortTelegramTopProducts([{ name: "Lovable10k Credits" }, { name: "Lovable 1,000 Credits" }, { name: "Lovable 500 Credits" }]).map((p) => p.name)).toEqual(["Lovable 500 Credits", "Lovable 1,000 Credits", "Lovable10k Credits"]);
  });
  test("unknown quantities stay together after known Lovable credits, with stable equal ordering", () => {
    const names = ["Lovable Lite 12m(LINK)", "Notion", "Lovable 100 Credit NW", "Lovable PRO 1M 100 Credit", "Lovable Pro 30 Days", "Outlook"];
    expect(sortTelegramTopProducts(names.map((name) => ({ name }))).map((p) => p.name)).toEqual([names[2], names[3], names[0], names[4], names[1], names[5]]);
  });
  test("sorting preserves objects, selections, prices, stock and original input order", () => {
    const input = [{ id: "a", name: "Lovable 20k Credits", price: 80, stock: 1 }, { id: "b", name: "Gemini Pro", price: 0.65, stock: 75 }];
    const output = selectTopProducts(input, ["a", "b", "a", "missing"]);
    expect(output).toHaveLength(2);
    expect(output[0]).toBe(input[1]);
    expect(output[1]).toBe(input[0]);
    expect(input.map((p) => p.id)).toEqual(["a", "b"]);
    expect(output[0]?.price).toBe(0.65);
    expect(output[1]?.stock).toBe(1);
  });
});

describe("All-products Telegram favorites", () => {
  test("every available input product appears without requiring saved selections", () => {
    const products = [{ id: "a", name: "Notion" }, { id: "b", name: "Gemini Pro" }, { id: "c", name: "Lovable 100 Credit" }];
    expect(telegramFavoritesPage(products, 0, 30).products.map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(telegramFavoritesPage(products, 0, 30).total).toBe(3);
  });
  test("same-name distinct products stay adjacent without deduplication", () => {
    const products = [{ id: "a", name: "Supabase Pro 12m FW" }, { id: "b", name: "Notion" }, { id: "c", name: "Supabase Pro 12m FW" }];
    expect(telegramFavoritesPage(products, 0, 30).products.map((p) => p.id)).toEqual(["a", "c", "b"]);
  });
  test("other brands stay together and token amounts ascend within their brand", () => {
    const names = ["Muse AI 20B Token", "Nord VPN 3M", "Notion Business", "Muse AI Account — 1 Billion Tokens", "NordVpn 3 Months Basic", "Muse AI 5B Token"];
    expect(sortTelegramTopProducts(names.map((name) => ({ name }))).map((p) => p.name)).toEqual([names[3], names[5], names[0], names[1], names[4], names[2]]);
  });
  test("Next and Previous reach all 65 products in 30-row pages without missing or repeating rows", () => {
    const products = Array.from({ length: 65 }, (_, i) => ({ id: String(i), name: "Gemini Pro" }));
    const pages = [0, 1, 2].map((page) => telegramFavoritesPage(products, page, 30));
    expect(pages.map((p) => p.products.length)).toEqual([30, 30, 5]);
    expect(pages.map((p) => [p.hasPrevious, p.hasNext])).toEqual([[false, true], [true, true], [true, false]]);
    expect(pages.flatMap((p) => p.products.map((item) => item.id))).toEqual(products.map((p) => p.id));
    expect(telegramFavoritesPage(products, 1, 30).products[0]?.id).toBe("30");
    expect(telegramFavoritesPage(products, 99, 30).page).toBe(2);
  });
  test("empty favorites have no next page and sorting retains effective prices and stock", () => {
    expect(telegramFavoritesPage([], 1, 30)).toEqual({ products: [], page: 0, hasPrevious: false, hasNext: false, total: 0 });
    const input = [{ name: "Lovable 305 Credit", price: 5.8, stock: 23 }, { name: "Gemini Pro", price: 0.65, stock: 75 }];
    const page = telegramFavoritesPage(input, 0, 30);
    expect(page.products[0]).toBe(input[1]);
    expect(page.products[1]?.price).toBe(5.8);
    expect(page.products[1]?.stock).toBe(23);
  });
  test("favorites pagination imposes no 1000-product total limit", () => {
    const products = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), name: "Gemini Pro" }));
    const visited: string[] = [];
    for (let index = 0; ; index++) {
      const page = telegramFavoritesPage(products, index, 30);
      visited.push(...page.products.map((p) => p.id));
      if (!page.hasNext) break;
    }
    expect(visited).toHaveLength(1205);
    expect(new Set(visited).size).toBe(1205);
    expect(visited.at(-1)).toBe("1204");
  });
});

describe("Top Products admin supplier filter", () => {
  const list = [
    { name: "Muse AI Account", supplier_name: "Vexorix" },
    { name: "YouTube 3M Link", supplier_name: "Routeis" },
    { name: "Lovable Lite", supplier_name: null },
    { name: "Gamma Pro", supplier_name: "Vexorix " },
  ];
  test("clicking In-house keeps only products without a supplier", () => {
    expect(filterCatalogue(list, { supplier: IN_HOUSE_FILTER }).map((p) => p.name)).toEqual(["Lovable Lite"]);
  });
  test("clicking a supplier keeps only that supplier's products", () => {
    expect(filterCatalogue(list, { supplier: "Vexorix" }).map((p) => p.name)).toEqual(["Muse AI Account", "Gamma Pro"]);
  });
  test("no selection shows everything and the filter combines with the search box", () => {
    expect(filterCatalogue(list, {}).length).toBe(4);
    expect(filterCatalogue(list, { supplier: "Vexorix", search: "gamma" }).map((p) => p.name)).toEqual(["Gamma Pro"]);
    expect(filterCatalogue(list, { supplier: "Routeis", search: "lovable" })).toEqual([]);
  });
  test("chip counts cover every supplier and in-house once", () => {
    const counts = countBySupplier(list);
    expect(counts.get("Vexorix")).toBe(2);
    expect(counts.get("Routeis")).toBe(1);
    expect(counts.get(IN_HOUSE_FILTER)).toBe(1);
  });
});