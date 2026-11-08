import { expect, test } from "bun:test";
import { apiQuickGuideText } from "../../src/lib/bot/api-quick-guide";
const t = apiQuickGuideText();
test("guide uses only QORIX base and placeholder key", () => {
  expect(t).toContain("https://qorixlab.com/api/public/reseller/v1/me");
  expect(t).toContain("&lt;your_api_key&gt;");
  expect(t).not.toMatch(/qxr_[0-9a-f]/);
  expect(t).not.toMatch(/mylabsstore|pirmelabs|prime/i);
  expect(t.length).toBeLessThan(4096);
});
