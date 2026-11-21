import { z } from "zod";
import { PAYMENT_WINDOW_MS } from "@/lib/payment-deadline";

export const browserPaymentInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const browserGateway = z.enum(["payid", "bybit", "chain_trc20", "chain_bep20", "usdt_trc20", "usdt_bep20", "eps_mfs", "eps_card", "oxapay"]);
export type BrowserGateway = z.infer<typeof browserGateway>;
export type BrowserPaymentPreview = {
  status: string; total: number; expires_at: string;
  orders: { number: number; name: string; quantity: number; total: number; status: string }[];
  gateways: { id: BrowserGateway; label: string }[];
  deposit: { kind: string; network: string | null; address: string; amount: number; gateway: string } | null;
};
export function browserPaymentOpen(row: { status: string; created_at: string; expires_at: string }, now = Date.now()) {
  const deadline = Math.min(Date.parse(row.expires_at), Date.parse(row.created_at) + PAYMENT_WINDOW_MS);
  return ["ready", "starting", "pending"].includes(row.status) && Number.isFinite(deadline) && now < deadline;
}
export function browserPaymentUrl(origin: string, token: string) {
  browserPaymentInput.parse({ token });
  const url = new URL("/pay", origin);
  if (url.protocol !== "https:") throw new Error("Secure website URL required.");
  url.hash = token;
  if (url.href.length > 256) throw new Error("Payment link is too long to copy.");
  return url.href;
}
export function checkoutPaymentMethods(stars: boolean) {
  return ["balance", "browser", ...(stars ? ["stars"] : [])];
}
export function browserOrderRows(lines: { product: { id: string; name: string; delivery_type: string }; qty: number; unit: number; subtotal: number }[], total: number, coupon: string | null) {
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  let remaining = Math.round(total * 100);
  return lines.map((l, index) => {
    const cents = index === lines.length - 1 ? remaining : Math.min(remaining, Math.round(total * 100 * l.subtotal / subtotal));
    remaining -= cents;
    return { product_id: l.product.id, product_name: l.product.name, quantity: l.qty, unit_price: l.unit, total: cents / 100, discount: Math.round((l.subtotal - cents / 100) * 100) / 100, delivery_type: l.product.delivery_type, coupon_code: coupon };
  });
}