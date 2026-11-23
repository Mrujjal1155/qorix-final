import { applyTier, type BulkTier } from "@/lib/bulk-discount";

type BulkDiscountCard = {
  productName: string;
  productIcon: string;
  basePrice: number;
  channel: string;
  tiers: Array<{ min_qty: number; type: string; value: number }>;
  icons: { badge: string; end: string; base: string; row: string; arrow: string; off: string; note: string };
};

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (value: number) => `$${value.toFixed(2)}`;

/** Build native rich content directly; line-card conversion cannot detect bulk tiers. */
export function bulkDiscountCard(input: BulkDiscountCard): string {
  const first = input.tiers[0];
  if (!first) return "";
  const { icons, basePrice } = input;
  const row = (quantity: string, unit: number, saving: number) =>
    `<tr><td>${icons.row} ${quantity} pcs</td><td align="right">${icons.arrow} ${money(unit)}</td><td align="right">${saving > 0 ? `${icons.off} ${saving}%` : "—"}</td></tr>`;
  let rows = first.min_qty > 1 ? row(`1–${first.min_qty - 1}`, basePrice, 0) : "";
  input.tiers.forEach((tier, index) => {
    const next = input.tiers[index + 1];
    const quantity = next ? `${tier.min_qty}–${next.min_qty - 1}` : `${tier.min_qty}+`;
    const unit = applyTier(basePrice, tier as BulkTier);
    const saving = basePrice > 0 ? Math.round(((basePrice - unit) / basePrice) * 100) : 0;
    rows += row(quantity, unit, saving);
  });
  const where = input.channel === "bot" ? "Telegram bot" : input.channel === "api" ? "API users" : "Telegram bot & API users";
  return `<h3>${input.productIcon} ${escape(input.productName)}</h3>` +
    `<p>${icons.badge} <b>BULK DISCOUNT</b> ${icons.end}</p>` +
    `<p>${icons.base} Base price: <b>${money(basePrice)} / piece</b></p>` +
    `<table bordered striped compact><tr><td><b>Quantity</b></td><td align="right"><b>Per piece</b></td><td align="right"><b>Save</b></td></tr>${rows}</table>` +
    `<p>${icons.note} <b>Buy in bulk, grow with confidence.</b></p>` +
    `<p><i>More savings on every order, more room for your business to grow. Wishing you continued success!</i></p>` +
    `<p><i>Valid on ${where}. Not combined with flash sales.</i></p>`;
}