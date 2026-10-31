import { expect, test } from "bun:test";
import { customerAlertSettingSchema, alertQueuePageSchema, cancelAlertSchema } from "../../src/lib/customer-alerts";

const id = "b1bf7142-3497-4f69-8108-213a63e966de";
test("admin can explicitly enable and disable one product's customer alerts", () => {
  expect(customerAlertSettingSchema.parse({ id, enabled: true })).toEqual({ id, enabled: true });
  expect(customerAlertSettingSchema.parse({ id, enabled: false })).toEqual({ id, enabled: false });
  expect(customerAlertSettingSchema.safeParse({ id, enabled: "false" }).success).toBe(false);
});
test("pending list accepts page offsets but rejects invalid pagination", () => {
  expect(alertQueuePageSchema.parse({}).offset).toBe(0);
  expect(alertQueuePageSchema.parse({ offset: 50 }).offset).toBe(50);
  expect(alertQueuePageSchema.safeParse({ offset: -1 }).success).toBe(false);
});
test("single-alert cancellation requires an actual alert identifier", () => {
  expect(cancelAlertSchema.parse({ id }).id).toBe(id);
  expect(cancelAlertSchema.safeParse({ id: "all" }).success).toBe(false);
});