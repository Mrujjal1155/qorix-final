import { describe, expect, it } from "vitest";
import { legacySwitchOn, stockKindToNotify } from "../../src/lib/telegram-notify-routes";
import { liveDestinations } from "../../src/lib/live-update-delivery";

const matrix = JSON.stringify({ general: { live_purchase: true }, updates: {}, channel: {}, dm: {} });

describe("Telegram Notifications is the single control", () => {
  it("old off switch is ignored once the matrix is saved", () => {
    expect(legacySwitchOn({ announce_restock: "off", notify_routes: matrix }, "announce_restock")).toBe(true);
  });
  it("old off switch still works before the matrix is saved", () => {
    expect(legacySwitchOn({ announce_restock: "off" }, "announce_restock")).toBe(false);
  });
  it("Telegram admin broadcasts follow the Bot DM switch", () => {
    expect(stockKindToNotify("broadcast")).toBe("admin_broadcast");
  });
  it("purchase reaches General Chat when its switch is on, without the old opt-in", () => {
    const d = liveDestinations({ kind: "purchase", general_enabled: false }, { notify_routes: matrix, notify_chat_general: "-100" });
    expect(d.general).toBe("-100");
  });
});
