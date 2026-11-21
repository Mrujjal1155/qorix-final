import { beforeEach, expect, mock, test } from "bun:test";
import { websiteDeliveryEligible, type WebsiteDeliveryOrder } from "../../src/lib/website-order-delivery";

let order: WebsiteDeliveryOrder;
let state: string;
let summarySent: boolean;
let summaryOk: boolean;
let rateLimited: boolean;
let deliveryOk: boolean;
let summaries: { chat: number; text: string }[];
let deliveries: { chat: number; items: string[] }[];
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: async () => ({ data: state === "pending" ? (state = "sending", [{ order_id: order.id, telegram_id: 123, claim_token: "claim", summary_sent: summarySent }]) : [], error: null }),
  from: (table: string) => {
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: order, error: null }),
      update: (values: Record<string, unknown>) => {
        if (table === "website_order_deliveries") {
          if (typeof values['status'] === 'string') state = values['status'];
          if (values['summary_sent'] === true) summarySent = true;
        }
        return q;
      },
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    }; return q;
  },
} }));
mock.module("@/lib/telegram.server", () => ({ sendMessage: async (chat: number, text: string) => {
  summaries.push({ chat, text }); return { ok: summaryOk, error_code: rateLimited ? 429 : 403 };
} }));
mock.module("@/lib/bot/deliver-items.server", () => ({ deliverItemsToChat: async (chat: number, _name: string, items: string[]) => {
  deliveries.push({ chat, items }); return { sent: deliveryOk ? items.length : 0, failed: deliveryOk ? 0 : items.length, fallbackFile: false };
} }));
const { sendWebsiteOrderDelivery } = await import("../../src/lib/website-order-delivery.server");
beforeEach(() => {
  order = { id: "9992082d-1111-4111-8111-111111111111", source: "website", status: "completed", telegram_id: 123, reseller_id: null,
    delivered_content: "first-account\n---\nsecond-account", product_name: "Product", order_no: 4834, quantity: 2, total: 0.03, payment_method: "wallet" };
  state = "pending"; summarySent = false; summaryOk = true; rateLimited = false; deliveryOk = true; summaries = []; deliveries = [];
});
test("completed website order sends its summary and saved delivery only to checkout Telegram", async () => {
  expect(await sendWebsiteOrderDelivery(order.id)).toBe(true);
  expect(summaries[0]?.chat).toBe(123);
  expect(deliveries).toEqual([{ chat: 123, items: ["first-account", "second-account"] }]);
  expect(summaries[0]?.text).toContain("#4834");
  expect(summaries[0]?.text).toContain("ORD-9992082D");
  expect(summaries[0]?.text).toContain("$0.03");
  expect(state).toBe("sent");
});
test("repeated completion cannot resend accepted delivery", async () => {
  await sendWebsiteOrderDelivery(order.id); await sendWebsiteOrderDelivery(order.id);
  expect(deliveries).toHaveLength(1); expect(summaries).toHaveLength(1);
});
test("recipient mismatch never exposes credentials", async () => {
  order.telegram_id = 456;
  expect(await sendWebsiteOrderDelivery(order.id)).toBe(false); expect(deliveries).toHaveLength(0); expect(summaries).toHaveLength(0);
});
test("guest orders never send private delivery", () => {
  order.telegram_id = null; expect(websiteDeliveryEligible(order, 123)).toBe(false);
});
test("pending orders never send delivery", async () => {
  order.status = "pending"; await sendWebsiteOrderDelivery(order.id); expect(deliveries).toHaveLength(0);
});
test("reseller orders never enter customer delivery", async () => {
  order.reseller_id = "reseller"; await sendWebsiteOrderDelivery(order.id); expect(deliveries).toHaveLength(0);
});
test("failed Telegram send does not undo website completion or mark sent", async () => {
  deliveryOk = false; expect(await sendWebsiteOrderDelivery(order.id)).toBe(false);
  expect(order.status).toBe("completed"); expect(order.total).toBe(0.03); expect(state).toBe("review");
  await sendWebsiteOrderDelivery(order.id); expect(deliveries).toHaveLength(1);
});
test("definitive rate limit before credentials leaves delivery waiting", async () => {
  summaryOk = false; rateLimited = true; await sendWebsiteOrderDelivery(order.id);
  expect(state).toBe("pending"); expect(summarySent).toBe(false); expect(deliveries).toHaveLength(0);
});
test("blocked private chat never receives credentials", async () => {
  summaryOk = false; await sendWebsiteOrderDelivery(order.id);
  expect(state).toBe("review"); expect(deliveries).toHaveLength(0);
});