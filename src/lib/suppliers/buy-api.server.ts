import { supplierOrder, supplierProducts, type SupplierRow, type SupplierProduct } from './api.server';
import { supportsBuyWatch, buyWatchProductEligible } from '../supplier-buy-rules';

export class BuyRejected extends Error {}

/** Request-local sharing only: the next five-second tick always reads fresh stock. */
export function buyWatchApi(): typeof buyApi {
  const catalogues = new Map<string, Promise<SupplierProduct[]>>();
  return async (s, path, body, fetcher) => {
    if (s.key === 'digitalcore' || body) return buyApi(s, path, body, fetcher);
    if (!supportsBuyWatch(s.key, s.base_url)) throw new Error('Unsupported supplier address');
    let catalogue = catalogues.get(s.id);
    if (!catalogue) { catalogue = supplierProducts(s); catalogues.set(s.id, catalogue); }
    const id = new URLSearchParams(path.split('?')[1]).get('id');
    const product = (await catalogue).find(p => p.external_id === id);
    if (!product || !buyWatchProductEligible(product.raw)) throw new Error('Product unavailable for automatic buying');
    return { id: product.external_id, stock: product.stock, min_qty: product.min_qty };
  };
}

// This adapter deliberately never retries, changes auth, or follows redirects.
export async function buyApi(s: SupplierRow, path: string, body?: object, fetcher: typeof fetch = fetch): Promise<any> {
  if (!supportsBuyWatch(s.key, s.base_url)) throw new Error('Automatic purchase is not supported for this supplier');
  if (s.key !== 'digitalcore') {
    if (!body) return buyWatchApi()(s, path);
    const purchase = body as { id: string; count: number; reference?: string };
    if (!purchase.reference) throw new Error('A durable purchase reference is required');
    try {
      const result = await supplierOrder(s, purchase.id, purchase.count, purchase.reference, { oneShot: true });
      return { order_id: result.code, items: result.items };
    } catch (error) {
      // Only a proven rejection may pause rather than enter review; never guess stock errors.
      if ((error as { deliveryOutcome?: string })?.deliveryOutcome === 'rejected') throw new BuyRejected('SUPPLIER_REJECTED');
      throw error;
    }
  }
  const apiKey = s.api_key?.trim() || process.env['DIGITALCORE_API_KEY']?.trim();
  if (!apiKey) throw new Error('Missing supplier API key');
  const base = new URL(s.base_url);
  if (base.protocol !== 'https:' || !['digitalcore.top', 'www.digitalcore.top'].includes(base.hostname) || base.username || base.password) throw new Error('Unsupported supplier address');
  const res = await fetcher(new URL(`/api/user/${path}`, base), {
    method: body ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(12000),
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body: JSON.stringify({ id: (body as any).id, count: (body as any).count }) } : {}),
  });
  const data = await res.json().catch(() => null);
  const rejected = ['INSUFFICIENT_BALANCE', 'OUT_OF_STOCK', 'ID_REQUIRED', 'INVALID_COUNT', 'MAX_COUNT_EXCEEDED', 'PRODUCT_NOT_FOUND', 'MISSING_API_KEY', 'INVALID_API_KEY'];
  if (body && [400,401,404].includes(res.status) && data?.success === false && rejected.includes(data?.msg)) throw new BuyRejected(data.msg);
  if (!res.ok || !data || (body && data.success !== true)) throw new Error('Supplier response needs verification');
  return data;
}