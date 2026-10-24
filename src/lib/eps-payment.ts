/** EPS payer fees are not merchant funds and must never become wallet credit. */
export function epsMerchantAmount(data: Record<string, unknown>): number {
  const value = data["StoreAmount"] ?? data["storeAmount"] ?? data["TotalAmount"] ?? data["totalAmount"];
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function epsWalletCredit(expectedUsd: number, receivedMerchantBdt: number, expectedBdt: number) {
  if (!Number.isFinite(expectedUsd) || expectedUsd <= 0 || !Number.isFinite(expectedBdt) || expectedBdt <= 0 ||
      !Number.isFinite(receivedMerchantBdt) || receivedMerchantBdt < expectedBdt) {
    throw new Error("Payment amount does not cover this checkout.");
  }
  return expectedUsd;
}