import { describe, expect, mock, test } from "bun:test";
import { productListBatch, type ListProduct } from "../../src/lib/product-list";

const calls: { method: string; body: any }[] = [];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (method: string, body: any) => { calls.push({method,body}); return {data:{id:"queued-event",total:2}}; },
    from: (table: string) => {
      if (table !== "bot_settings") throw new Error(`Unexpected table: ${table}`);
      return { select: () => ({ order: () => ({ range: async () => ({ data: [{ key: "announce_chat_id", value: "-1001234567890" }] }) }) }) };
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
    const result = await sendProductList({ ...snapshot, products: productListBatch(products).products }, "admin-id", "request-id");
    expect(result.total).toBe(2);
    expect(result.id).toBe("queued-event");
    expect(calls[0]?.body._groups).toEqual([-1001234567890]);
    for (const call of calls) {
      expect(call.method).toBe("enqueue_product_list");
      expect(call.body._message.text).toContain("Product 40 END");
      expect(call.body._message.text).not.toContain("Product 41 END");
      expect((call.body._message.text.match(/emoji-id/g) ?? []).length).toBe(40);
      expect(call.body._event_key).toBe("broadcast:product-list:admin-id:request-id");
    }
  });
  test("second send broadcasts only the remaining 30 products", async () => {
    calls.length = 0;
    await sendProductList({ ...snapshot, products: productListBatch(products, 40).products }, "admin-id", "next-request");
    expect(calls.length).toBe(1);
    for (const call of calls) {
      expect(call.body._message.text).toContain("Product 41 END");
      expect(call.body._message.text).toContain("Product 70 END");
      expect(call.body._message.text).not.toContain("Product 40 END");
    }
  });
  test("rejects more than 40 products without broadcasting", async () => {
    calls.length = 0;
    await expect(sendProductList({ ...snapshot, products: products.slice(0, 41) }, "admin", "request")).rejects.toThrow("too large");
    expect(calls.length).toBe(0);
  });
});