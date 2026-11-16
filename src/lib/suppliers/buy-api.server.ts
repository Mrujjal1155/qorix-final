import type { SupplierRow } from './api.server';
import { supportsBuyWatch } from '../supplier-buy-rules';

export class BuyRejected extends Error {}

// This adapter deliberately never retries, changes auth, or follows redirects.
export async function buyApi(s: SupplierRow, path: string, body?: object, fetcher: typeof fetch = fetch): Promise<any> {
  if (!supportsBuyWatch(s.key, s.base_url) || !s.api_key) throw new Error('Automatic purchase is not supported for this supplier');
  const base = new URL(s.base_url);
  if (base.protocol !== 'https:' || !['digitalcore.top', 'www.digitalcore.top'].includes(base.hostname) || base.username || base.password) throw new Error('Unsupported supplier address');
  const res = await fetcher(new URL(`/api/user/${path}`, base), {
    method: body ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(12000),
    headers: { 'Api-Key': s.api_key, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  const rejected = ['INSUFFICIENT_BALANCE', 'OUT_OF_STOCK', 'ID_REQUIRED', 'INVALID_COUNT', 'MAX_COUNT_EXCEEDED', 'PRODUCT_NOT_FOUND', 'MISSING_API_KEY', 'INVALID_API_KEY'];
  if (body && [400,401,404].includes(res.status) && data?.success === false && rejected.includes(data?.msg)) throw new BuyRejected(data.msg);
  if (!res.ok || !data || (body && data.success !== true)) throw new Error('Supplier response needs verification');
  return data;
}