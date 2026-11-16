export function buyBatchQuantity(stock: number, remaining: number, min = 1, max = 1000): number {
  if (![stock, remaining, min, max].every(Number.isSafeInteger) || stock < 0 || remaining < 1 || min < 1 || max < min) return 0;
  const available = Math.min(stock, remaining, max);
  const qty = available === remaining ? available : available >= 20 ? Math.floor(available / 10) * 10 : Math.floor(available / 5) * 5;
  return qty >= min ? qty : 0;
}

export function buyOutcome(items: string[], requested: number): 'completed' | 'unknown' {
  return items.length === requested && items.every(x => typeof x === 'string' && x.length > 0) ? 'completed' : 'unknown';
}

export function supportsBuyWatch(key: string, base: string) {
  return /digitalcore/i.test(key) || /^https:\/\/(?:www\.)?digitalcore\.top(?:\/|$)/i.test(base);
}

export function buyItemsText(batches: { items: unknown }[]): string {
  return batches.flatMap(b => Array.isArray(b.items) ? b.items.filter((x): x is string => typeof x === 'string') : []).join('\n');
}