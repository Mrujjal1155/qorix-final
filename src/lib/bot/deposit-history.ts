/**
 * Recent Deposits view for the Telegram bot wallet.
 * Pure helpers: merge auto-gateway deposits (binance_deposits) with manual
 * payment requests (payment_requests) and render a monospace table that
 * fits Telegram's mobile width inside a <pre> block.
 */

export type DepositStatus = "complete" | "pending" | "failed" | "expired";

export interface UnifiedDeposit {
  gateway: string;
  amount: number;
  status: DepositStatus;
  created_at: string;
}

/** Human label for each auto-gateway deposit kind stored in binance_deposits. */
export function depositGatewayLabel(kind: string): string {
  switch (kind) {
    case "payid":
      return "Binance Pay";
    case "crypto":
      return "Binance USDT";
    case "bybit":
      return "Bybit Pay";
    case "chain_trc20":
      return "USDT TRC20";
    case "chain_bep20":
      return "USDT BEP20";
    case "oxapay":
      return "OxaPay";
    case "eps":
      return "EPS";
    default:
      return kind || "Unknown";
  }
}

/** Map a raw row status onto the four display states. */
export function depositStatus(raw: string, source: "auto" | "manual"): DepositStatus {
  const s = (raw || "").toLowerCase();
  if (source === "auto") {
    if (s === "credited") return "complete";
    if (s === "expired") return "expired";
    if (s === "failed" || s === "rejected") return "failed";
    return "pending";
  }
  if (s === "approved") return "complete";
  if (s === "rejected" || s === "failed") return "failed";
  if (s === "expired") return "expired";
  return "pending";
}

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  complete: "✅ Complete",
  pending: "⏳ Pending",
  failed: "❌ Failed",
  expired: "⌛ Expired",
};

/** Manual payment request method label (bKash/Nagad/etc). */
export function manualMethodLabel(method: string): string {
  const m = (method || "").toLowerCase();
  if (m === "bkash") return "bKash";
  if (m === "nagad") return "Nagad";
  if (m === "rocket") return "Rocket";
  return method ? method.charAt(0).toUpperCase() + method.slice(1) : "Manual";
}

/**
 * Merge auto-gateway deposit rows and manual payment requests into one
 * list sorted newest-first. Inputs may each be pre-sorted; output is
 * always sorted by created_at descending.
 */
export function mergeDepositRows(
  auto: Array<{ kind: string; amount_usdt: number | string; status: string; created_at: string }>,
  manual: Array<{ method: string; amount: number | string; status: string; created_at: string }>,
): UnifiedDeposit[] {
  const rows: UnifiedDeposit[] = [
    ...auto.map((r) => ({
      gateway: depositGatewayLabel(r.kind),
      amount: Number(r.amount_usdt),
      status: depositStatus(r.status, "auto"),
      created_at: r.created_at,
    })),
    ...manual.map((r) => ({
      gateway: manualMethodLabel(r.method),
      amount: Number(r.amount),
      status: depositStatus(r.status, "manual"),
      created_at: r.created_at,
    })),
  ];
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  return rows;
}

function pad(value: string, width: number): string {
  const v = value.length > width ? value.slice(0, width) : value;
  return v + " ".repeat(Math.max(0, width - v.length));
}

function escapePre(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Short date like "02 Nov" in the shop's display timezone. */
export function depositDate(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone });
  } catch {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
}

/**
 * Render rows as a fixed-width table for a Telegram <pre> block.
 * Columns: Gateway (11) · Amount (8) · Status (10, icon shown separately) · Date (6).
 * Status icons stay outside <pre> per line is not possible, so the icon is
 * included in the Status column text.
 */
export function formatDepositTable(rows: UnifiedDeposit[], timeZone: string): string {
  const header = `${pad("Gateway", 12)}${pad("Amount", 9)}${pad("Status", 10)}Date`;
  const divider = "─".repeat(38);
  const lines = rows.map((r) => {
    const amount = `$${r.amount.toFixed(2)}`;
    const status =
      r.status === "complete" ? "Complete" : r.status === "pending" ? "Pending" : r.status === "failed" ? "Failed" : "Expired";
    return `${pad(r.gateway, 12)}${pad(amount, 9)}${pad(status, 10)}${depositDate(r.created_at, timeZone)}`;
  });
  return escapePre([header, divider, ...lines].join("\n"));
}

/** Per-line status icon shown before each table row is not possible inside
 * one <pre>; instead we append a compact legend under the table. */
export function depositTableLegend(): string {
  return "✅ Complete · ⏳ Pending · ❌ Failed · ⌛ Expired";
}
