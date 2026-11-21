import { beforeEach, expect, mock, test } from "bun:test";
const general = "-1004204339897", live = "-1002587419870";
let rows: any[] = [], sends: any[] = [], failures: Record<string, any> = {}, receiptFailure = false;
const orderId = "11111111-1111-4111-8111-111111111111";
const makeEvent = (kind = "payment", id = "e1") => ({ id, ref: `${kind === "purchase" ? "order" : kind}:${orderId}`, kind, status: kind === "payment" ? "awaiting_sender" : "pending", general_enabled: true, general_sent: false, live_sent: false, attempts: 0, created_at: "2026-11-21T15:09:00Z", next_attempt_at: "2026-11-21T15:09:00Z", delivery_errors: {}, payload: { uid: "2808123968", name: "Customer", source: "website", product: "Product", qty: 2, method: "EPS" } });
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    let update: any, columns = "";
    const filters: Array<(r: any) => boolean> = [];
    const chain: any = {
      select: (c: string) => { columns = c; return chain; },
      update: (v: any) => { update = v; return chain; },
      eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return chain; },
      lte: (k: string, v: any) => { filters.push((r) => r[k] <= v); return chain; },
      in: () => chain, or: () => chain, order: () => chain, limit: () => chain,
      then: (resolve: any, reject: any) => Promise.resolve().then(() => {
        if (table === "bot_settings") return { data: [{key:"live_channel_id",value:live},{key:"announce_chat_id",value:general},{key:"bot_username",value:"QORIX3_bot"}] };
        if (table === "orders") return {data:[{id:orderId,product_id:"p1"}]};
        if (table === "products") return {data:[{id:"p1",telegram_custom_emoji_id:"5204116184986844054"}]};
        if (table !== "live_update_events") throw new Error(`Unexpected table ${table} / ${columns}`);
        if (receiptFailure && (update?.general_sent || update?.live_sent)) return { data:null,error:{message:"Receipt unavailable"} };
        const found = rows.filter((r) => filters.every((f) => f(r)));
        if (update) found.forEach((r) => Object.assign(r, update));
        return { data: found, error: null };
      }).then(resolve,reject),
    };
    return chain;
  },
} }));
mock.module("@/lib/telegram.server", () => ({ sendAlertMessage: async (chat: string, text: string, keyboard: any) => {
  sends.push({chat,text,keyboard}); return failures[chat] ?? {ok:true};
} }));
mock.module("@/lib/bot/engine.server", () => ({ announceOrderSale: async (id: string, queued: boolean) => {
  sends.push({chat:general,id,queued}); return failures[general] ?? {ok:true};
} }));
const { drainLiveUpdates } = await import("../../src/lib/live-update.server");
beforeEach(() => { rows = [makeEvent()]; sends = []; failures = {}; receiptFailure = false; });
test("verified direct payment is released by the compatible sender and delivered to both groups", async () => {
  expect(await drainLiveUpdates()).toEqual({sent:1});
  expect(sends.map((s) => s.chat)).toEqual([general,live]);
  expect(rows[0]?.status).toBe("sent");
  expect(rows[0]?.general_sent).toBe(true); expect(rows[0]?.live_sent).toBe(true);
  await drainLiveUpdates(); expect(sends).toHaveLength(2);
});
test("website delivery uses the original general sale sender plus the original live purchase sender", async () => {
  rows = [makeEvent("purchase")];
  await drainLiveUpdates();
  expect(sends[0]).toEqual({chat:general,id:orderId,queued:true});
  expect(sends[1]?.keyboard[0][0].icon_custom_emoji_id).toBe("5204116184986844054");
  expect(rows[0]?.status).toBe("sent");
});
test("one group's rate limit still delivers the other and retries only the unaccepted destination", async () => {
  failures[general] = {ok:false,error_code:429,parameters:{retry_after:120}};
  const started = Date.now();
  await drainLiveUpdates();
  expect(sends.map((s) => s.chat)).toEqual([general,live]);
  expect(rows[0]?.status).toBe("pending"); expect(rows[0]?.live_sent).toBe(true);
  expect(new Date(rows[0]?.next_attempt_at).getTime()).toBeGreaterThanOrEqual(started+120000);
  await drainLiveUpdates(); expect(sends).toHaveLength(2);
  failures = {}; rows[0].next_attempt_at = "2026-11-21T15:09:00Z";
  await drainLiveUpdates(); expect(sends.map((s) => s.chat)).toEqual([general,live,general]);
  expect(rows[0]?.status).toBe("sent");
});
test("permanent general-group failure does not discard the live-group rate-limit retry", async () => {
  failures[general] = {ok:false,error_code:403}; failures[live] = {ok:false,error_code:429,parameters:{retry_after:1}};
  await drainLiveUpdates(); expect(rows[0]?.status).toBe("pending");
  rows[0].next_attempt_at = "2026-11-21T15:09:00Z"; failures = {};
  await drainLiveUpdates(); expect(sends.map((s) => s.chat)).toEqual([general,live,live]);
  expect(rows[0]?.status).toBe("failed"); expect(rows[0]?.live_sent).toBe(true);
});
test("uncertain transport result is reviewed without replaying either accepted or uncertain destination", async () => {
  failures[general] = {ok:false,description:"Timeout"};
  await drainLiveUpdates(); expect(rows[0]?.status).toBe("review"); expect(rows[0]?.live_sent).toBe(true);
  await drainLiveUpdates(); expect(sends).toHaveLength(2);
});
test("failure to save an accepted receipt leaves its claim held and prevents duplicates", async () => {
  receiptFailure = true;
  await expect(drainLiveUpdates()).rejects.toThrow("Could not save accepted group delivery receipt");
  expect(rows[0]?.status).toBe("sending");
  receiptFailure = false; await drainLiveUpdates(); expect(sends).toHaveLength(1);
});
test("one tick uses at most six destination sends and leaves untouched events pending", async () => {
  rows = [1,2,3,4].map((n) => makeEvent("topup",`e${n}`));
  expect(await drainLiveUpdates()).toEqual({sent:3}); expect(sends).toHaveLength(6);
  expect(rows[3]?.status).toBe("pending"); expect(rows[3]?.attempts).toBe(0);
});