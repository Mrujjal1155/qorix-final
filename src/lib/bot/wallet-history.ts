import { orderTimezone } from "../order-time";

export const HISTORY_PAGE_SIZE = 5;
export type HistoryTab = "transactions" | "payments";
export type HistoryRow = {
  id: string; amount: number | string; status: string; created_at: string;
  type?: string; method?: string | null; kind?: string; network?: string | null;
  checkout?: boolean;
};

export function historyPage(value: string): number | null {
  if (!/^\d{1,6}$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 0 ? page : null;
}

export function historyOwner(chat: { id?: number; type?: string }, senderId?: number): number | null {
  return chat.type === "private" && Number.isSafeInteger(senderId) && Number(senderId) > 0 && chat.id === senderId
    ? Number(senderId) : null;
}

export function historyStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "completed": case "credited": case "approved": case "paid": return "✅ Completed";
    case "pending": return "⏳ Pending";
    case "processing": return "🔄 Processing";
    case "failed": return "❌ Failed";
    case "rejected": return "⛔ Rejected";
    case "expired": return "⌛ Expired";
    case "cancelled": case "canceled": return "🚫 Cancelled";
    case "refunded": return "↩️ Refunded";
    default: return "❔ Unknown";
  }
}

export function historyMethod(method?: string | null, network?: string | null): string {
  const key = (method ?? "").toLowerCase().replace(/[ _-]/g, "");
  const names: Record<string, string> = {
    payid: "Binance Pay", binancepay: "Binance Pay", bybit: "Bybit Pay", bybitpay: "Bybit Pay",
    chaintrc20: "USDT · TRC20", chainbep20: "USDT · BEP20", oxapay: "OxaPay",
    bkash: "bKash", nagad: "Nagad", rocket: "Rocket", wallet: "Wallet", balance: "Wallet",
    admin: "Admin", referral: "Referral", redeem: "Redeem code",
  };
  if (key === "eps") return network === "card" ? "EPS · Card" : "EPS · Mobile banking";
  if (key === "crypto") return network ? `Binance · ${network.toUpperCase().slice(0, 16)}` : "Binance Crypto";
  return names[key] ?? (method ? "Other" : "—");
}

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const row = (label: string, value: string) => `<tr><td>${label}</td><td align="right">${value}</td></tr>`;

/** Display-only: a payment attempt never becomes a wallet-ledger entry. */
export function buildWalletHistory(rows: HistoryRow[], tab: HistoryTab, heading: string, timezone?: string): string {
  const dates = new Intl.DateTimeFormat("en-GB", { timeZone: orderTimezone(timezone), day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const kinds: Record<string, string> = { deposit: "Deposit", purchase: "Purchase", admin: "Admin adjustment", referral: "Referral", refund: "Refund", redeem: "Redeem", preorder: "Pre-order" };
  const body = rows.slice(0, HISTORY_PAGE_SIZE).map((entry) => {
    const amount = Number(entry.amount);
    const date = new Date(entry.created_at);
    const label = tab === "payments" ? (entry.checkout ? "Checkout payment" : "Wallet deposit") : (kinds[entry.type ?? ""] ?? "Transaction");
    const amountLabel = Number.isFinite(amount) ? `${tab === "transactions" ? (amount < 0 ? "−" : "+") : ""}$${Math.abs(amount).toFixed(2)}` : "—";
    return row(`<b>${tab === "transactions" ? (amount < 0 ? "↘" : "↗") : "💳"} ${label}</b>`, `<b>${amountLabel}</b>`) +
      row("Method", esc(historyMethod(entry.kind ?? entry.method, entry.network))) +
      row("Status", historyStatus(entry.status)) +
      row("Date", Number.isFinite(date.getTime()) ? esc(dates.format(date)) : "—");
  }).join("");
  return `<h3>${heading}</h3>` + (body ? `<table bordered striped compact>${body}</table>` : `<p>${tab === "payments" ? "No payment attempts yet." : "No transactions yet."}</p>`);
}