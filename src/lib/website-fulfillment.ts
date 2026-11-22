export function websitePaymentVerified(value: unknown = {}): boolean {
  const meta = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  return meta['paid'] === true || meta['eps_paid'] === true || meta['oxapay_paid'] === true ||
    Boolean(meta['paid_at']) || ['binance', 'bybit', 'blockchain'].some(key => meta[key]?.status === 'verified');
}

export function websiteFulfillmentEligible(order: {
  source: string; status: string; reseller_id?: string | null; delivered_content?: string | null;
  meta?: unknown;
}): boolean {
  const meta = order.meta && typeof order.meta === 'object' && !Array.isArray(order.meta) ? order.meta as Record<string, any> : {};
  return order.source === 'website' && order.status === 'pending' && !order.reseller_id &&
    !order.delivered_content?.trim() && !meta['refunded'] && meta['awaiting_payment'] !== true &&
    websitePaymentVerified(meta);
}