import { expect, test } from "bun:test";
import { shouldAnnounceBulk } from "../../src/lib/bulk-discount";

test("every new active bulk discount broadcasts even if a stale client disables notify", () => {
  expect(shouldAnnounceBulk({ is_active: true, notify: false })).toBe(true);
});
test("inactive drafts do not announce a discount that cannot be used", () => {
  expect(shouldAnnounceBulk({ is_active: false, notify: true })).toBe(false);
});
test("ordinary edits do not rebroadcast unless the admin asks to broadcast the update", () => {
  expect(shouldAnnounceBulk({ id: "existing", is_active: true, notify: false })).toBe(false);
  expect(shouldAnnounceBulk({ id: "existing", is_active: true, notify: true })).toBe(true);
});