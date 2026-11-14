// Pure referral-commission math and Telegram table builder.
// The database (referral_award) applies the same rule; this module only
// mirrors it for display and tests — it never moves money.

export const REFCOMM_PAGE_SIZE = 10;

export type ReferralCommissionRow = {
  id: string;
  order_no: number | string | null;
  product_name: string | null;
  admin_profit: number | string | null;
  percent: number | string | null;
  amount: number | string | null;
  wallet_amount: number | string | null;
  status: string;
  reversed_amount?: number | string | null;
  created_at: string;
  buyer_telegram_id?: number | string | null;
  buyer_user_id?: string | null;
  channel?: string | null;
};

export type ReferralCommissionIcons = Partial<
  Record<"product" | "profit" | "earned" | "customer" | "date" | "credited" | "reversed", string>
>;

/** Cost per unit locked on the order at purchase time; unknown cost counts as 0. */
export function unitCostOf(order: { meta?: Record<string, unknown> | null }): number {
  const saved = order?.meta?.unit_cost;
  const n = Number(saved);
  return saved != null && Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Admin net profit = selling price − (purchase-time cost × quantity). */
export function adminNetProfit(order: {
  total?: number | string | null;
  quantity?: number | string | null;
  meta?: Record<string, unknown> | null;
}): number {
  const total = Number(order?.total ?? 0);
  const qty = Number(order?.quantity ?? 0) || 1;
  return total - unitCostOf(order) * qty;
}

/** Exact commission (no rounding): $0.10 profit at 5% is $0.005. */
export function commissionExact(profit: number, percent: number): number {
  if (!Number.isFinite(profit) || !Number.isFinite(percent) || profit <= 0 || percent <= 0) return 0;
  return (profit * percent) / 100;
}

/** Whole cents that actually land in a wallet (wallets hold 2 decimals). */
export function walletCents(exact: number): number {
  if (!Number.isFinite(exact) || exact <= 0) return 0;
  return Math.round((exact + Number.EPSILON) * 100) / 100;
}

/** $0.005 stays $0.005 — never rounded up to $0.01 for display. */
export function formatExactAmount(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  let s = Math.abs(n).toFixed(6).replace(/0+$/, "");
  if (s.endsWith(".")) s += "00";
  if (!s.includes(".")) s += ".00";
  if (/\.?\d$/.test(s) && !/\.\d\d$/.test(s)) s = s.replace(/(\.\d)$/, "$10");
  return `${sign}$${s}`;
}

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cell = (label: string, value: string) =>
  `<tr><td>${label}</td><td align="right">${value}</td></tr>`;

function shortId(value?: string | null) {
  return value ? value.slice(0, 8) : "—";
}

function customerLabel(row: ReferralCommissionRow) {
  const tg = row.buyer_telegram_id;
  if (tg != null && Number(tg) > 0) return String(tg);
  return shortId(row.buyer_user_id);
}

/**
 * Commission history as a compact Telegram table: product + exact commission,
 * profit/rate/status, then order, customer, transaction id and date.
 */
export function buildReferralCommissionHistory(
  rows: ReferralCommissionRow[],
  heading: string,
  timezone?: string,
  icons: ReferralCommissionIcons = {},
): string {
  const dates = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const body = rows
    .map((row) => {
      const product = esc(String(row.product_name ?? "Order"));
      const earned = formatExactAmount(row.amount);
      const profit = formatExactAmount(row.admin_profit);
      const rate = `${Number(row.percent ?? 0)}%`;
      const reversed = row.status === "reversed";
      const status = reversed
        ? `${icons.reversed ?? "↩"} Reversed`
        : `${icons.credited ?? "✅"} Credited`;
      const date = new Date(row.created_at);
      const time = Number.isFinite(date.getTime()) ? esc(dates.format(date)) : "—";
      return (
        cell(
          `<b>${icons.product ?? "📦"} ${product}</b>`,
          `<b>${icons.earned ?? "💸"} ${earned}</b>`,
        ) +
        cell(
          `${icons.profit ?? "💹"} Profit ${profit} · ${rate}`,
          `<b>${status}</b>`,
        ) +
        cell(
          `${icons.customer ?? "🆔"} #${esc(String(row.order_no ?? "—"))} · ${esc(customerLabel(row))} · ${shortId(row.id)}`,
          `${icons.date ?? "📅"} ${time}`,
        )
      );
    })
    .join("");

  return (
    `<h3>${heading}</h3>` +
    (body
      ? `<table bordered striped compact>${body}</table>`
      : `<p>${icons.earned ?? "💸"} No referral commissions yet. Your friends' purchases will show up here.</p>`)
  );
}
