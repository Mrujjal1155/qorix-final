// Pure helpers for the admin "Sales" popup on the products page.
export type SaleRow = { created_at: string; quantity: number; total: number; source: string | null; reseller_id?: string | null };

const DHAKA_MS = 6 * 3600_000;

/** Bangladesh calendar day (YYYY-MM-DD) for a UTC instant. */
export function dhakaDay(iso: string | number | Date): string {
  return new Date(new Date(iso).getTime() + DHAKA_MS).toISOString().slice(0, 10);
}

export function saleChannel(r: Pick<SaleRow, "source" | "reseller_id">): "Reseller" | "Website" | "Bot" {
  if (r.reseller_id || r.source === "reseller" || r.source === "api") return "Reseller";
  if (r.source === "website" || r.source === "web") return "Website";
  return "Bot";
}

export function summarizeSales(rows: SaleRow[], now: Date = new Date(), days = 30) {
  const today = dhakaDay(now);
  const dayStart = (n: number) => dhakaDay(now.getTime() - n * 86400_000);
  const d7 = dayStart(6);
  const d30 = dayStart(29);
  const bucket = (pred: (d: string) => boolean) => {
    let qty = 0, revenue = 0, orders = 0;
    for (const r of rows) {
      if (!pred(dhakaDay(r.created_at))) continue;
      qty += Number(r.quantity) || 0; revenue += Number(r.total) || 0; orders++;
    }
    return { qty, revenue: Math.round(revenue * 100) / 100, orders };
  };
  const daily: { day: string; qty: number }[] = [];
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = dhakaDay(r.created_at);
    map.set(d, (map.get(d) ?? 0) + (Number(r.quantity) || 0));
  }
  for (let i = days - 1; i >= 0; i--) {
    const d = dayStart(i);
    daily.push({ day: d, qty: map.get(d) ?? 0 });
  }
  return {
    today: bucket((d) => d === today),
    last7: bucket((d) => d >= d7),
    last30: bucket((d) => d >= d30),
    all: bucket(() => true),
    daily,
  };
}
