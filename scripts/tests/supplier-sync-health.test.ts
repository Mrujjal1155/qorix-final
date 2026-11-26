import { expect, test } from "bun:test";
import { supplierSyncHealth, supplierSyncMonitorHealth } from "../../src/lib/supplier-sync-health";

const serverNow = Date.parse("2026-11-26T08:31:48.205Z");
const lastSync = "2026-11-26T08:31:44.038+00:00";

test("fresh sync stays online even when browser clock is 840 minutes ahead", () => {
  const originalNow = Date.now;
  Date.now = () => serverNow + 840 * 60_000;
  try {
    // Reproduce the old browser-clock calculation before checking the correction.
    expect(Math.round((Date.now() - Date.parse(lastSync)) / 60_000)).toBe(840);
    expect(supplierSyncHealth(lastSync, serverNow)).toEqual({ state: "online", minutes: 0 });
  } finally {
    Date.now = originalNow;
  }
});

test("a genuine 840-minute delay remains visible", () => {
  expect(supplierSyncHealth("2026-11-25T18:31:48.205Z", serverNow))
    .toEqual({ state: "delayed", minutes: 840 });
});

test("the existing two-minute health boundary is preserved", () => {
  expect(supplierSyncHealth(new Date(serverNow - 119_999).toISOString(), serverNow).state).toBe("online");
  expect(supplierSyncHealth(new Date(serverNow - 120_000).toISOString(), serverNow).state).toBe("delayed");
});

test("missing sync does not report online", () => {
  expect(supplierSyncHealth(null, serverNow)).toEqual({ state: "not-running", minutes: null });
});

test("invalid timestamps cannot silently report a delay", () => {
  expect(() => supplierSyncHealth("invalid", serverNow)).toThrow();
});

test("detailed monitor uses server time for both run ages", () => {
  expect(supplierSyncMonitorHealth(lastSync, lastSync, serverNow))
    .toEqual({ lastRunSeconds: 4, lastSuccessSeconds: 4, needsAttention: false });
});

test("detailed monitor preserves its ten-minute clean-run boundary", () => {
  expect(supplierSyncMonitorHealth(lastSync, new Date(serverNow - 600_000).toISOString(), serverNow).needsAttention).toBe(false);
  expect(supplierSyncMonitorHealth(lastSync, new Date(serverNow - 600_001).toISOString(), serverNow).needsAttention).toBe(true);
});

test("missing clean run remains attention-worthy", () => {
  expect(supplierSyncMonitorHealth(lastSync, null, serverNow))
    .toEqual({ lastRunSeconds: 4, lastSuccessSeconds: null, needsAttention: true });
});