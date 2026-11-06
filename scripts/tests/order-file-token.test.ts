import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signOrderToken, verifyOrderToken, isOrderDownloadable } from "../../src/lib/order-file.server";

const ID = "11111111-2222-3333-4444-555555555555";
const NOW = 1_800_000_000;

describe("order download tokens", () => {
  const prev = process.env.ORDER_DOWNLOAD_SECRET;
  beforeEach(() => { process.env.ORDER_DOWNLOAD_SECRET = "test-secret-0123456789abcdef"; });
  afterEach(() => { process.env.ORDER_DOWNLOAD_SECRET = prev; });

  it("fails closed without the dedicated secret", () => {
    delete process.env.ORDER_DOWNLOAD_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(40);
    expect(signOrderToken(ID, "full", NOW)).toBeNull();
    expect(verifyOrderToken(`${ID}.full.${NOW + 10}.${"a".repeat(64)}`, NOW)).toBeNull();
  });

  it("accepts a fresh token with full-length HMAC", () => {
    const t = signOrderToken(ID, "full", NOW)!;
    expect(t.split(".")[3]).toHaveLength(64);
    expect(verifyOrderToken(t, NOW + 60)).toEqual({ orderId: ID, kind: "full" });
  });

  it("rejects tokens after 24 hours", () => {
    const t = signOrderToken(ID, "plain", NOW)!;
    expect(verifyOrderToken(t, NOW + 24 * 3600)).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const t = signOrderToken(ID, "plain", NOW)!;
    expect(verifyOrderToken(t.replace(".plain.", ".full."), NOW)).toBeNull();
  });

  it("only paid/delivered orders are downloadable", () => {
    expect(isOrderDownloadable({ status: "completed", delivered_content: "a:b" })).toBe(true);
    expect(isOrderDownloadable({ status: "pending", delivered_content: "a:b" })).toBe(false);
    expect(isOrderDownloadable({ status: "completed", delivered_content: "" })).toBe(false);
  });
});
