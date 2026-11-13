import { bybitTransactionKey } from "@/lib/bybit-payment";
import { chainTransactionKey } from "@/lib/blockchain-payment";

export const reconciliationGateways = ["payid", "bybit", "chain_trc20", "chain_bep20"] as const;
export type ReconciliationGateway = typeof reconciliationGateways[number];
export function paymentTransactionKey(kind: string, raw: string): string {
  const tx = raw.trim();
  if (kind === "bybit") return tx.startsWith("bybit:") ? bybitTransactionKey(tx.slice(6)) : bybitTransactionKey(tx);
  if (kind === "chain_trc20" || kind === "chain_bep20") {
    const network = kind === "chain_trc20" ? "trc20" : "bep20";
    const prefix = `chain:${network}:`;
    return chainTransactionKey(network, tx.startsWith(prefix) ? tx.slice(prefix.length) : tx);
  }
  if (kind === "payid" && /^[A-Za-z0-9_-]{6,128}$/.test(tx)) return tx;
  throw new Error("Unsupported payment or invalid transaction ID.");
}
export function reconciliationState(row: { status: string; tx_id?: string | null; meta?: any }, used: boolean, receipt?: { reason: string; admin_id: string; created_at: string } | null) {
  if (receipt) return "manual_verified" as const;
  if (row.status === "credited") return "verified" as const;
  if (["expired", "cancelled", "failed"].includes(row.status)) return "expired" as const;
  if (used) return "used" as const;
  return row.tx_id ? "unverified" as const : "no_id" as const;
}