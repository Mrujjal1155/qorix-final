import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { paymentTransactionKey, reconciliationState, reconciliationGateways } from "@/lib/payment-reconciliation";
import { paymentAttemptOpen } from "@/lib/payment-deadline";

export const listReconciliationPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ gateway: z.enum(reconciliationGateways), days: z.number().int().min(1).max(90), page: z.number().int().min(0).max(10000).default(0) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const sb = context.supabase as any;
    const { data: rows, error, count } = await sb.from("binance_deposits")
      .select("id,telegram_id,kind,amount_usdt,status,tx_id,created_at,expires_at,meta", { count: "exact" })
      .eq("kind", data.gateway).gte("created_at", new Date(Date.now() - data.days * 86400000).toISOString())
      .order("created_at", { ascending: false }).order("id").range(data.page * 100, data.page * 100 + 99);
    if (error) throw new Error("Could not load payment attempts.");
    const payments: any[] = rows ?? [];
    const ids = payments.map(row => row.id);
    const keys = payments.flatMap(row => { try { return row.tx_id ? [paymentTransactionKey(row.kind, row.tx_id)] : []; } catch { return []; } });
    const [claims, receipts] = await Promise.all([
      keys.length ? sb.from("binance_used_txs").select("tx_id").in("tx_id", keys) : { data: [] },
      ids.length ? sb.from("payment_manual_reconciliations").select("deposit_id,reason,admin_id,created_at").in("deposit_id", ids) : { data: [] },
    ]);
    if (claims.error || receipts.error) throw new Error("Could not load verification status.");
    const used = new Set((claims.data ?? []).map((r: any) => r.tx_id));
    const manual = new Map((receipts.data ?? []).map((r: any) => [r.deposit_id, r]));
    return { total: Number(count ?? 0), rows: payments.map(row => {
      let key: string | null = null;
      try { if (row.tx_id) key = paymentTransactionKey(row.kind, row.tx_id); } catch { /* Invalid submitted ID stays visible for review. */ }
      const receipt: any = manual.get(row.id);
      const status = row.status === "pending" && !paymentAttemptOpen(row) ? "expired" : row.status;
      const state = reconciliationState({ ...row, status }, key != null && used.has(key), receipt);
      return { id: String(row.id), who: String(row.telegram_id), amount: Number(row.amount_usdt), txid: row.tx_id ? String(row.tx_id) : null,
        time: String(row.created_at), status: String(status), state,
        canReconcile: state === "unverified" && key != null && Number(row.telegram_id) > 0 && !row.meta?.reseller_id,
        checkout: Array.isArray(row.meta?.items) && row.meta.items.length > 0,
        audit: receipt ? { admin: String(receipt.admin_id), reason: String(receipt.reason), time: String(receipt.created_at) } : null };
    }) };
  });

export const reconcileManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ depositId: z.string().uuid(), txid: z.string().trim().min(6).max(160), reason: z.string().trim().min(5).max(500), alreadyCredited: z.literal(true) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: row, error } = await sb.from("binance_deposits").select("id,kind,tx_id,amount_usdt").eq("id", data.depositId).maybeSingle();
    if (error || !row || row.tx_id !== data.txid) throw new Error("Payment changed. Refresh and try again.");
    let keys = [paymentTransactionKey(row.kind, data.txid)];
    if (row.kind === "payid") {
      // Both Binance Order ID and transaction ID identify the same payment. Fail closed if aliases cannot be resolved.
      const { listBinanceActivity } = await import("@/lib/binance.server");
      const history = await listBinanceActivity(30);
      if (!history.ok) throw new Error("Binance history unavailable. No ID was marked verified.");
      const hits = history.rows.filter(r => r.via.startsWith("Binance Pay") && [r.id, r.orderId].some(id => id?.toLowerCase() === data.txid.toLowerCase()));
      if (hits.length !== 1) throw new Error("Could not uniquely resolve both Binance payment IDs. No change was made.");
      const match = hits[0];
      if (!match || match.direction !== "in" || match.currency !== "USDT" || match.amount !== Number(row.amount_usdt) || !match.orderId) throw new Error("Incoming USDT amount or Binance payment IDs do not match.");
      keys = [...new Set([data.txid, match.id, match.orderId])];
    }
    const { data: result, error: saveError } = await sb.rpc("reconcile_manual_deposit", { _deposit_id: row.id, _expected_txid: data.txid, _keys: keys, _reason: data.reason, _admin_id: context.userId });
    if (saveError) throw new Error("Could not reconcile: payment changed, was already credited, or is unsupported. Refresh before trying again.");
    if (!result?.ok) throw new Error("This transaction is already reserved or processed. Do not add more balance.");
    return { ok: true, changed: result.changed === true };
  });