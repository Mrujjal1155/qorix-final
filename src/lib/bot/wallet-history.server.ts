import { HISTORY_PAGE_SIZE, type HistoryRow, type HistoryTab } from "./wallet-history";

/** Caller supplies the verified private-chat sender; never an ID from callback data. */
export async function readWalletHistory(db: any, ownerId: number, tab: HistoryTab, page: number): Promise<{ rows: HistoryRow[]; hasNext: boolean; error: boolean }> {
  const start = page * HISTORY_PAGE_SIZE;
  if (tab === "transactions") {
    const result = await db.from("transactions").select("id,amount,type,method,status,created_at")
      .eq("telegram_id", ownerId).order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(start, start + HISTORY_PAGE_SIZE);
    return { rows: (result.data ?? []).slice(0, HISTORY_PAGE_SIZE), hasNext: (result.data ?? []).length > HISTORY_PAGE_SIZE, error: Boolean(result.error) };
  }
  // Read top N from each stream then merge: deterministic global pagination without
  // fetching every attempt or mixing wallet credits with their payment attempts.
  const limit = start + HISTORY_PAGE_SIZE + 1;
  const [automatic, manual] = await Promise.all([
    db.from("binance_deposits").select("id,amount_usdt,kind,network,status,created_at,checkout_item:meta->items->0")
      .eq("telegram_id", ownerId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit),
    db.from("payment_requests").select("id,amount,method,status,created_at")
      .eq("telegram_id", ownerId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit),
  ]);
  if (automatic.error || manual.error) return { rows: [], hasNext: false, error: true };
  const rows: HistoryRow[] = [
    ...(automatic.data ?? []).map((r: any) => ({ id: r.id, amount: r.amount_usdt, kind: r.kind, network: r.network, status: r.status, created_at: r.created_at, checkout: r.checkout_item != null })),
    ...(manual.data ?? []).map((r: any) => ({ id: r.id, amount: r.amount, method: r.method, status: r.status, created_at: r.created_at })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return { rows: rows.slice(start, start + HISTORY_PAGE_SIZE), hasNext: rows.length > start + HISTORY_PAGE_SIZE, error: false };
}