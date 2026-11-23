import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductBulkTiers } from "@/lib/shop.functions";

type Row = { min_qty: number; label: string; unit: number; save: number; save_percent: number };

const usd = (v: number) => `$${Number(v ?? 0).toFixed(2)}`;

/**
 * Compact per-piece price table for products with an active bulk discount.
 * Display-only: checkout/bot/API pricing logic is untouched.
 */
export function BulkDiscountTable({ productId, compact = false }: { productId: string; compact?: boolean }) {
  const fetchTiers = useServerFn(getProductBulkTiers);
  const { data } = useQuery({
    queryKey: ["product-bulk-tiers", productId],
    queryFn: () => fetchTiers({ data: { id: productId } }),
    staleTime: 60_000,
  });
  const rows = ((data?.rows ?? []) as Row[]).filter((r) => r.save > 0);
  if (!rows.length) return null;

  if (compact) {
    // Telegram-style bubble table for the Mobile View product message.
    return (
      <section aria-label="Bulk discount" className="mt-4">
        <p className="mb-1 font-semibold">Bulk Discount</p>
        <div className="overflow-hidden rounded border border-tg-quote-bar/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-tg-quote text-left">
                <th className="px-2 py-1 font-semibold">Qty</th>
                <th className="px-2 py-1 font-semibold">Per piece</th>
                <th className="px-2 py-1 font-semibold">You save</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.min_qty} className="border-t border-tg-quote-bar/30">
                  <td className="px-2 py-1 font-semibold">{r.label} pcs</td>
                  <td className="px-2 py-1">{usd(r.unit)}</td>
                  <td className="px-2 py-1">{usd(r.save)} ({r.save_percent}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs italic text-tg-muted">Valid on Telegram bot &amp; API orders.</p>
      </section>
    );
  }

  return (
    <section aria-label="Bulk discount" className="mt-4 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-bold">Bulk Discount — buy more, pay less per piece</p>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-1 pr-2 font-semibold">Quantity</th>
            <th className="py-1 pr-2 font-semibold">Per piece</th>
            <th className="py-1 font-semibold">You save</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.min_qty} className="border-t border-border/60">
              <td className="py-1.5 pr-2 font-semibold">{r.label} pcs</td>
              <td className="py-1.5 pr-2">{usd(r.unit)}</td>
              <td className="py-1.5 text-success">{usd(r.save)} ({r.save_percent}%)</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">Valid on Telegram bot &amp; API orders.</p>
    </section>
  );
}
