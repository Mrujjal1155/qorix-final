import { beforeEach, expect, mock, test } from "bun:test";

let calls: Array<{ name: string; args: any }> = [];
let failed = false;
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => {
    const q: any = { select: () => q, order: () => q, range: async () => ({ data: [
      { key: "announce_chat_id", value: "-100111" },
      { key: "announce_chat_inhouse", value: "-100111" },
      { key: "announce_chat_supplier:test", value: "-100222" },
      { key: "bot_username", value: "example_bot" },
    ] }) };
    return q;
  },
  rpc: async (name: string, args: any) => {
    calls.push({ name, args });
    return failed ? { error: { message: "Queue unavailable" } } : { data: { id: "event", total: 3086 } };
  },
} }));
const { queueRichCatalogueNotice } = await import("../../src/lib/product-list.server");
const input = {
  text: "Saved rich notice", keyboard: [[{ text: "Buy", callback_data: "qty:product", style: "primary" as const }]],
  adminId: "verified-admin", requestId: "bulk:request:product", title: "Bulk Discount",
};
beforeEach(() => { calls = []; failed = false; });

test("bulk notice queues the full SQL-resolved audience, not a client-loaded user page", async () => {
  expect(await queueRichCatalogueNotice(input)).toEqual({ id: "event", total: 3086 });
  expect(calls[0]?.name).toBe("enqueue_product_list");
  expect(calls[0]?.args._groups).toEqual([-100111, -100222]);
  expect(calls[0]?.args._message.keyboard).toEqual(input.keyboard);
  expect(calls[0]?.args._message.admin_id).toBe("verified-admin");
});
test("the same request retains the same deduplication key", async () => {
  await queueRichCatalogueNotice(input);
  await queueRichCatalogueNotice(input);
  expect(calls.map(c => c.args._event_key)).toEqual([
    "broadcast:product-list:verified-admin:bulk:request:product",
    "broadcast:product-list:verified-admin:bulk:request:product",
  ]);
});
test("queue failures cannot be reported as a successful broadcast", async () => {
  failed = true;
  await expect(queueRichCatalogueNotice(input)).rejects.toThrow("Queue unavailable");
});