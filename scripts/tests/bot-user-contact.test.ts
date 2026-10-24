import { describe, expect, test } from "bun:test";
import { deliveryContact, membershipContact, TELEGRAM_UPDATES } from "../../src/lib/bot/contact";
import { botUserRequest } from "../../src/lib/bot-users";
import { readBotUserPage } from "../../src/lib/bot-users.server";

describe("Confirmed Telegram contact evidence", () => {
  test("private kicked and member updates identify block/unblock", () => {
    const update = (status: string, type = "private") => ({ my_chat_member: { chat: { type, id: 12345 }, date: 1792871220, new_chat_member: { status } } });
    expect(membershipContact(update("kicked"))?.status).toBe("blocked");
    expect(membershipContact(update("member"))?.status).toBe("reachable");
    expect(membershipContact(update("left"))?.status).toBe("stopped");
    expect(membershipContact(update("kicked", "supergroup"))).toBeNull();
    expect(TELEGRAM_UPDATES).toContain("my_chat_member");
  });
  test("only explicit user failures establish blocked or deactivated", () => {
    const send = (description: string) => deliveryContact("sendMessage", { chat_id: 12345 }, { ok: false, description });
    expect(send("Forbidden: bot was blocked by the user")?.status).toBe("blocked");
    expect(send("Forbidden: user is deactivated")?.status).toBe("deactivated");
    for (const description of ["Forbidden: not enough rights", "network error", "Too Many Requests", "Bad Request: chat not found"]) expect(send(description)).toBeNull();
    expect(deliveryContact("editMessageText", { chat_id: 12345 }, { ok: true })).toBeNull();
    expect(deliveryContact("sendMessage", { chat_id: -12345 }, { ok: true })).toBeNull();
    expect(deliveryContact("sendMessage", { chat_id: 12345 }, { ok: true })?.status).toBe("reachable");
  });
});

describe("Complete bot member pagination", () => {
  function database() {
    const calls: any[] = [];
    const users = Array.from({ length: 1708 }, (_, i) => ({ telegram_id: i + 1 }));
    const query: any = {};
    for (const method of ["select", "gt", "lte", "eq", "ilike", "order"]) query[method] = (...args: any[]) => { calls.push([method, ...args]); return query; };
    query.range = async (start: number, end: number) => ({ data: users.slice(start, end + 1), count: users.length });
    return { sb: { from: () => query }, calls };
  }
  test("all 1708 users can be browsed beyond the old 200 and 1000 limits", async () => {
    const { sb } = database();
    const ids: number[] = [];
    for (let page = 0; page < 35; page++) {
      const result = await readBotUserPage(sb, botUserRequest.parse({ page }));
      expect(result.count).toBe(1708);
      ids.push(...result.rows.map((u: any) => u.telegram_id));
    }
    expect(ids.length).toBe(1708);
    expect(new Set(ids).size).toBe(1708);
    expect(ids.at(-1)).toBe(1708);
  });
  test("normalizes search and applies contact and balance filters before paging", async () => {
    const { sb, calls } = database();
    await readBotUserPage(sb, botUserRequest.parse({ search: " @alice ", balance: "with", contact: "blocked", page: 2 }));
    expect(calls).toContainEqual(["ilike", "username", "%alice%"]);
    expect(calls).toContainEqual(["eq", "contact_status", "blocked"]);
    expect(calls).toContainEqual(["gt", "balance", 0]);
    expect(calls[0][2]).toEqual({ count: "exact" });
    expect(() => botUserRequest.parse({ page: -1 })).toThrow();
  });
});