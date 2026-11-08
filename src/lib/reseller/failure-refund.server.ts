import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** The order lock, original debit, refund ledger and terminal state commit together. */
export async function refundResellerDeliveryFailure(orderId: string, code: "out_of_stock" | "delivery_rejected" | "delivery_failed", supplierError?: string | null) {
  const { data, error } = await (supabaseAdmin as any).rpc("refund_failed_reseller_order", {
    _order_id: orderId, _failure_code: code, _supplier_error: supplierError ?? null,
  });
  if (error || !["refunded", "already_refunded"].includes(data?.status)) {
    console.error("reseller refund requires reconciliation", orderId, error ?? data?.status);
    return { ok: false as const, status: 503, error: "Delivery status could not be confirmed — please contact support." };
  }
  return { ok: false as const, status: 409, code: "delivery_failed", refunded: true, error: "Delivery failed — please try again later." };
}