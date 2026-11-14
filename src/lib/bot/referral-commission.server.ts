import { REFCOMM_PAGE_SIZE, type ReferralCommissionRow } from "@/lib/referral-commission";

export type ReferralCommissionPage = {
  rows: ReferralCommissionRow[];
  total: number;
  page: number;
  hasNext: boolean;
  error: boolean;
};

/**
 * One page of the caller's own commission history.
 * The RPC is service-role only and filters by the telegram id it is given,
 * so the caller must already be the verified sender of the message.
 */
export async function readReferralCommissions(
  db: any,
  telegramId: number,
  page: number,
): Promise<ReferralCommissionPage> {
  const { data, error } = await db.rpc("referral_commission_history", {
    _telegram_id: telegramId,
    _page: page,
    _page_size: REFCOMM_PAGE_SIZE,
  });
  if (error || !data) return { rows: [], total: 0, page, hasNext: false, error: true };
  const rows = (data.rows ?? []) as ReferralCommissionRow[];
  const total = Number(data.total ?? 0);
  return {
    rows,
    total,
    page,
    hasNext: (page + 1) * REFCOMM_PAGE_SIZE < total,
    error: false,
  };
}
