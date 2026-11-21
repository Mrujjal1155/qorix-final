import { expect, test } from "bun:test";
import { liveDestinations, liveFailure } from "../../src/lib/live-update-delivery";

const settings = { live_channel_id: "-1002587419870", announce_chat_id: "-1004204339897" };
test("new topups and verified website payments target both existing groups", () => {
  for (const kind of ["topup", "payment"] as const) expect(liveDestinations({ kind, general_enabled: true }, settings)).toEqual({ live: "-1002587419870", general: "-1004204339897" });
});
test("successful website deliveries target both existing groups", () => {
  expect(liveDestinations({ kind: "purchase", general_enabled: true }, settings)).toEqual({ live: "-1002587419870", general: "-1004204339897" });
});
test("old events and bot purchases do not repeat their existing general-group announcement", () => {
  expect(liveDestinations({ kind: "purchase", general_enabled: false }, settings).general).toBe("");
});
test("a confirmed destination is never sent again while the other group retries", () => {
  expect(liveDestinations({ kind: "topup", general_enabled: true, general_sent: true }, settings)).toEqual({ live: "-1002587419870", general: "" });
  expect(liveDestinations({ kind: "purchase", general_enabled: true, live_sent: true }, settings)).toEqual({ live: "", general: "-1004204339897" });
});
test("a blocked group does not block the remaining group's pending attempt", () => {
  expect(liveDestinations({ kind: "topup", general_enabled: true, delivery_errors: { general: { status: "failed" }, live: { status: "pending" } } }, settings)).toEqual({ live: "-1002587419870", general: "" });
});
test("existing independent sales switches are respected", () => {
  expect(liveDestinations({ kind: "purchase", general_enabled: true }, { ...settings, live_purchase: "off" })).toEqual({ live: "", general: "-1004204339897" });
  expect(liveDestinations({ kind: "purchase", general_enabled: true }, { ...settings, announce_sales: "off" })).toEqual({ live: "-1002587419870", general: "" });
});
test("Telegram retry_after is honored without a five-attempt discard", () => {
  expect(liveFailure({ error_code: 429, parameters: { retry_after: 91 } })).toEqual({ status: "pending", delay: 91 });
});
test("uncertain delivery is reviewed rather than blindly repeated", () => {
  expect(liveFailure({})).toEqual({ status: "review", delay: 0 });
  expect(liveFailure({ error_code: 403 }).status).toBe("failed");
});