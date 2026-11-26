export function validBuyChoices(choices: number[]): boolean {
  const [first, second, last] = choices;
  return first !== undefined && second !== undefined && last !== undefined && choices.length === 3 && choices.every(n => Number.isSafeInteger(n) && n >= 1 && n <= 1000) && first > second && second > last;
}

export function chooseBuyQuantity(stock: number, choices: number[], rejected: number[] = []) {
  const checked: number[] = [];
  if (!validBuyChoices(choices) || !Number.isSafeInteger(stock) || stock < 0) return { quantity: 0, checked };
  const ceiling = rejected.length ? Math.min(...rejected) : Infinity;
  for (const qty of choices) {
    if (qty >= ceiling) continue;
    checked.push(qty);
    if (stock >= qty) return { quantity: qty, checked };
  }
  return { quantity: 0, checked };
}

export async function readAllBuyProducts(db: any, supplierId: string) {
  const rows: any[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await db.from('supplier_products').select('id,supplier_id,external_id,name,stock,min_qty,raw')
      .eq('supplier_id', supplierId).eq('stock', 0).order('name').order('id').range(start, start + 499);
    if (error) throw new Error('Products unavailable');
    rows.push(...(data ?? []).filter((p: any) => buyWatchProductEligible(p.raw)));
    if (!data || data.length < 500) return rows;
  }
}

export function buyBatchQuantity(stock: number, remaining: number, min = 1, max = 1000): number {
  if (![stock, remaining, min, max].every(Number.isSafeInteger) || stock < 0 || remaining < 1 || min < 1 || max < min) return 0;
  const available = Math.min(stock, remaining, max);
  const qty = available === remaining ? available : available >= 20 ? Math.floor(available / 10) * 10 : Math.floor(available / 5) * 5;
  return qty >= min ? qty : 0;
}

export function buyOutcome(items: string[], requested: number): 'completed' | 'unknown' {
  return items.length === requested && items.every(x => typeof x === 'string' && x.length > 0) ? 'completed' : 'unknown';
}

export function buyWatchProductEligible(raw: any): boolean {
  return raw?.api_orderable !== false && raw?.manual_delivery !== true &&
    !raw?.purchaseRequirements?.customerEmail &&
    !['manual', 'activation'].includes(String(raw?.delivery_mode ?? raw?.stock?.type ?? '').toLowerCase());
}

export function supportsBuyWatch(key: string, base: string) {
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port) return false;
    const hosts: Record<string, readonly string[]> = {
      digitalcore: ['digitalcore.top', 'www.digitalcore.top'],
      mailreader: ['api.mailreader.tech'],
      canboso: ['canboso.com'],
      insightstore: ['api.insightxpro.store'],
      routeis: ['api.cmpdr.dev'],
      primelabs: ['prime-labs.tech'],
      qamify: ['api.qamify.site'],
      vexoran: ['eismrrkygprctnwxmkbw.supabase.co'],
      vexorix: ['vexorixstore.shop'],
    };
    return hosts[key.toLowerCase()]?.includes(url.hostname) === true;
  } catch { return false; }
}

export function buyItemsText(batches: { items: unknown }[]): string {
  return batches.flatMap(b => Array.isArray(b.items) ? b.items.filter((x): x is string => typeof x === 'string') : []).join('\n');
}