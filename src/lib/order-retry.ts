/** Whether an in-house automatic order still needs a delivery retry. */
export function canRetryInhouseOrder(
  order: { status: string; delivery_type: string; supplier_name?: string | null },
  payment: { paid: boolean; refunded: boolean },
): boolean {
  return !order.supplier_name &&
    order.delivery_type === "auto" &&
    payment.paid &&
    !payment.refunded &&
    (order.status === "pending" || order.status === "failed" || order.status === "blocked");
}