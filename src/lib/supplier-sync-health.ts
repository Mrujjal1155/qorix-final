/** Compare UTC timestamps on the server, never against the browser's wall clock. */
export function supplierSyncHealth(lastSyncedAt: string | null, serverNow: number) {
  if (lastSyncedAt === null) return { state: "not-running" as const, minutes: null };
  const timestamp = Date.parse(lastSyncedAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(serverNow)) {
    throw new Error("Invalid supplier sync timestamp");
  }
  const age = Math.max(0, serverNow - timestamp);
  return {
    state: age < 120_000 ? "online" as const : "delayed" as const,
    minutes: Math.round(age / 60_000),
  };
}

/** The detailed monitor retains its separate ten-minute clean-run threshold. */
export function supplierSyncMonitorHealth(lastRun: string | null, lastSuccess: string | null, serverNow: number) {
  const age = (iso: string | null) => {
    if (!iso) return null;
    const timestamp = Date.parse(iso);
    if (!Number.isFinite(timestamp) || !Number.isFinite(serverNow)) throw new Error("Invalid supplier sync timestamp");
    return Math.max(0, serverNow - timestamp);
  };
  const runAge = age(lastRun);
  const successAge = age(lastSuccess);
  return {
    lastRunSeconds: runAge === null ? null : Math.round(runAge / 1000),
    lastSuccessSeconds: successAge === null ? null : Math.round(successAge / 1000),
    needsAttention: successAge === null || successAge > 10 * 60_000,
  };
}