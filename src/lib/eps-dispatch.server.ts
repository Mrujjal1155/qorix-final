import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Incoming IDs are only hints; both settlement paths verify with EPS. */
export async function dispatchEpsPayment(mtid: string, etid: string | null) {
  const db = supabaseAdmin as any;
  let query = db.from("binance_deposits").select("id").eq("kind", "eps");
  if (mtid) query = query.eq("meta->>mtid", mtid);
  else if (etid) query = query.eq("meta->>eps_tid", etid);
  else return { ok: false, reason: "Missing transaction id." };
  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false, reason: "Payment verification will retry." };
  if (data) {
    const { settleEpsBotPayment } = await import("@/lib/bot/engine.server");
    return settleEpsBotPayment(data.id, mtid || null, etid);
  }
  const { settleEpsPayment, epsSettings } = await import("@/lib/eps-settle.server");
  if (!mtid && etid) {
    const { epsConfig, verifyTransaction } = await import("@/lib/eps.server");
    const verified = await verifyTransaction(epsConfig(await epsSettings()), { epsTransactionId: etid });
    if (!verified.ok) return { ok: false, reason: "Payment verification will retry." };
    mtid = verified.info.merchantTransactionId;
  }
  return settleEpsPayment(mtid, etid);
}