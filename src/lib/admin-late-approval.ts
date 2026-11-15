/** Rules for admin approval of late (expired / TXID-closed) deposits. Pure, tested. */
export type LateGateway = "payid" | "bybit" | "chain_bep20" | "chain_trc20";

/** Only Binance Pay, Bybit, USDT BEP20 and USDT TRC20 support admin late approval. */
export function lateApprovalGateway(method: string | null | undefined): LateGateway | null {
  const m = String(method ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (m.includes("binance")) return "payid";
  if (m.includes("bybit")) return "bybit";
  if (m.includes("bep20") || m.includes("bsc")) return "chain_bep20";
  if (m.includes("trc20") || m.includes("trx") || m.includes("tron")) return "chain_trc20";
  return null;
}

/** One admin credit per transaction, across all requests (falls back to request id when no TXID). */
export function lateApprovalReference(gateway: LateGateway, txid: string | null | undefined, requestId: string): string {
  const key = String(txid ?? "").trim();
  return key ? `admin-approved:${gateway}:${gateway === "payid" ? key.toLowerCase() : key}` : `admin-approved:req:${requestId}`;
}

export function canAdminDecide(status: string | null | undefined): boolean {
  return status === "pending" || status === "expired";
}
