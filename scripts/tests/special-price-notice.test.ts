import { expect, test } from "bun:test";
import { buildSpecialPriceNotice, saveSpecialPrice } from "../../src/lib/bot/special-price.server";

const product = { id: "11111111-1111-4111-8111-111111111111", name: "Product <A>", price: 12.5 };
test("user special price opens the existing quantity checkout for that exact product", () => {
  const notice = buildSpecialPriceNotice("user", product, 10, 1, {});
  expect(notice.keyboard[0]?.[0]?.callback_data).toBe(`qty:${product.id}`);
  expect(notice.keyboard[1]?.map(b => b.callback_data)).toEqual(["profile", "home"]);
});
test("reseller special price opens API prices, never regular bot checkout", () => {
  const notice = buildSpecialPriceNotice("reseller", product, 4, 3, {});
  expect(notice.keyboard[0]?.[0]?.callback_data).toBe("api:prices");
});
test("premium icons use stored Bot Admin IDs for message and button", () => {
  const notice = buildSpecialPriceNotice("user", product, 10, 1, { ui_icon_special_gift: "5400280896311944999|🎁", ui_icon_special_buy: "5400280896311944998|🛒" });
  expect(notice.text).toContain('emoji-id="5400280896311944999"');
  expect(notice.keyboard[0]?.[0]?.icon_custom_emoji_id).toBe("5400280896311944998");
});
test("atomic operation receives only the selected target, exact price and quantity", async () => {
  let params: any;
  const db = {
    from: (table: string) => { const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: product }), in: async () => ({ data: [] }) }; return chain; },
    rpc: async (name: string, args: any) => { expect(name).toBe("save_special_price_notice"); params = args; return { data: { ok: true, notice: "queued" } }; },
  };
  expect(await saveSpecialPrice(db, "user", "123", product.id, 10, 3, "admin-id")).toEqual({ ok: true, notice: "queued" });
  expect(params._target).toBe("123"); expect(params._price).toBe(10); expect(params._min_qty).toBe(3);
  expect(params._admin_id).toBe("admin-id"); expect(params._message.keyboard[0][0].callback_data).toBe(`qty:${product.id}`);
});
test("read failure cannot save a price without its notice", async () => {
  let writes = 0;
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ error: {} }), in: async () => ({ data: [] }) };
  await expect(saveSpecialPrice({ from: () => chain, rpc: async () => { writes++; } }, "user", "123", product.id, 10, 1, "admin")).rejects.toThrow();
  expect(writes).toBe(0);
});
test("atomic save status preserves unchanged, unreachable and non-applicable outcomes", async () => {
  for (const status of ["unchanged", "unreachable", "not_applicable"]) {
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: product }), in: async () => ({ data: [] }) };
    const result = await saveSpecialPrice({ from: () => chain, rpc: async () => ({ data: { ok: true, notice: status } }) }, "user", "123", product.id, 10, 1, "admin");
    expect(result.notice).toBe(status);
  }
});