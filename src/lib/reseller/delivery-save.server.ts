import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Never manufacture completion from an in-memory supplier response. */
export async function saveResellerDelivery(orderId: string, content: string | null, supplierError: string | null = null) {
  const db = supabaseAdmin as any;
  const { data, error } = await db.rpc("save_reseller_delivery", { _order_id: orderId, _content: content, _supplier_error: supplierError });
  if (!error && data?.order) return data.order;
  // Lost acknowledgement may follow a committed save. Read, never repurchase.
  const { data: saved, error: readError } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!readError && saved?.status === "completed" && saved.delivered_content) return saved;
  console.error("Reseller delivery save requires reconciliation", orderId, error ?? data?.status);
  return null;
}