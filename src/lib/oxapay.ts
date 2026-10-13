// Pure OxaPay rules shared by the website checkout, the bot and tests.
// Docs: https://docs.oxapay.com (v1 merchant API).

/** Only these invoice statuses mean the money is really ours. */
export function oxapayIsPaid(status: string) {
  return ["paid", "manual_accept"].includes(String(status || "").trim().toLowerCase());
}

/** Invoice amount (USD) must cover what we asked for — no rounding slack beyond 1 cent. */
export function oxapayCovers(paidAmount: number, expectedUsd: number) {
  const paid = Math.round(Number(paidAmount || 0) * 100);
  const want = Math.round(Number(expectedUsd || 0) * 100);
  return want > 0 && paid >= want;
}

export function oxapayIsOn(settings: Record<string, string>) {
  return ["1", "on", "true", "yes"].includes(String(settings["oxapay_enabled"] || "").trim().toLowerCase());
}

/** Preserve the checkout snapshot through invoice creation and later settlement. */
export function oxapayDepositMeta(meta: Record<string, unknown>, trackId?: string, payUrl?: string) {
  return {
    ...meta,
    gateway: "oxapay",
    ...(trackId ? { track_id: trackId, pay_url: payUrl } : {}),
  };
}
