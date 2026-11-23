import { describe, expect, it } from "vitest";
import { notifyRoute, stockKindToNotify } from "../../src/lib/telegram-notify-routes";
import { liveDestinations } from "../../src/lib/live-update-delivery";

const routes = JSON.stringify({ general: { restock: true }, updates: { restock: false, live_payment: true }, channel: { restock: true }, dm: { restock: false, bulk_discount: true } });
const s = { notify_routes: routes, announce_chat_id: "-100111", notify_chat_updates: "-100222", notify_chat_channel: "-100333" };

describe("telegram notification routing", () => {
  it("keeps legacy routing until the admin saves", () => {
    expect(notifyRoute({ announce_chat_id: "-1" }, "restock")).toEqual({ configured: false });
  });
  it("sends only to switched-on groups", () => {
    expect(notifyRoute(s, "restock")).toEqual({ configured: true, groups: ["-100111", "-100333"], dm: false });
  });
  it("bot DM switch is independent", () => {
    expect(notifyRoute(s, "bulk_discount")).toEqual({ configured: true, groups: [], dm: true });
  });
  it("maps stock kinds", () => {
    expect(stockKindToNotify("out")).toBe("sold_out");
    expect(stockKindToNotify("flash_end")).toBe("flash_sale");
  });
  it("routes payment alerts only to switched-on places", () => {
    expect(liveDestinations({ kind: "payment" }, s)).toMatchObject({ live: "-100222", general: "" });
  });
});
