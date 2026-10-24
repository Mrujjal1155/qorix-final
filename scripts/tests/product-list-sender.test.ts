import { describe, expect, mock, test } from "bun:test";
import { productListBatch, type ListProduct } from "../../src/lib/product-list";

const calls: { method: string; body: any }[] = [];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== "bot_settings") throw new Error(`Unexpected table: ${table}`);
      return { select: async () => ({ data: [{ key: "announce_chat_id", value: "-1001234567890" }] }) };
    },
  },
}));
mock.module("@/lib/telegram.server", () => ({ tg: async (method: string, body: any) => {
  calls.push({ method, body });
  return { ok: true };
} }));
mock.module("@/lib/bot/audience.server", () => ({
  loadAllBotUserIds: async () => [12345],
  sendPaced: async (ids: number[], send: (id: number) => Promise<{ ok: boolean }>) => {
    let sent = 0;
    for (const id of ids) if ((await send(id)).ok) sent++;
    return { sent, failed: ids.length - sent };
  },
}));
const { sendProductList } = await import("../../src/lib/product-list.server");
const products: ListProduct[] = Array.from({ length: 70 }, (_, i) => ({
  name: `Product ${i + 1} END`, price: 1, emoji: "🔥", custom_emoji_id: "5368324170671202286",
}));
const snapshot = { storeName: "QORIX", botUsername: "QORIX3_bot", emojis: {} };

describe("Product list batch delivery", () => {
  test("first send broadcasts only the previewed 40 products to group and user", async () => {
    calls.length = 0;
    const result = await sendProductList({ ...snapshot, products: productListBatch(products).products });
    expect(result.groupsSent).toBe(1);
    expect(result.sent).toBe(1);
    expect(calls.map((c) => c.body.chat_id)).toEqual(["-1001234567890", 12345]);
    for (const call of calls) {
      expect(call.method).toBe("sendRichMessage");
      expect(call.body.rich_message.markdown).toContain("Product 40 END");
      expect(call.body.rich_message.markdown).not.toContain("Product 41 END");
      expect((call.body.rich_message.markdown.match(/tg:\/\/emoji/g) ?? []).length).toBe(40);
    }
  });
  test("second send broadcasts only the remaining 30 products", async () => {
    calls.length = 0;
    await sendProductList({ ...snapshot, products: productListBatch(products, 40).products });
    expect(calls.length).toBe(2);
    for (const call of calls) {
      expect(call.body.rich_message.markdown).toContain("Product 41 END");
      expect(call.body.rich_message.markdown).toContain("Product 70 END");
      expect(call.body.rich_message.markdown).not.toContain("Product 40 END");
    }
  });
  test("rejects more than 40 products without broadcasting", async () => {
    calls.length = 0;
    await expect(sendProductList({ ...snapshot, products: products.slice(0, 41) })).rejects.toThrow("too large");
    expect(calls.length).toBe(0);
  });
});