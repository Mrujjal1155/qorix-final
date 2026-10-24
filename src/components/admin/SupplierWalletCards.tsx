import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet } from "lucide-react";
import { checkSupplierBalances } from "@/lib/admin.functions";
import { colorIndexesFor, supplierBadgeStyle } from "@/lib/supplier-colors";

/** Dashboard supplier wallet cards — each supplier keeps its shared admin colour. */
export function SupplierWalletCards() {
  const fetchBalances = useServerFn(checkSupplierBalances);
  const { data } = useQuery({
    queryKey: ["supplier-balances"],
    queryFn: () => fetchBalances({}),
    refetchInterval: 60_000,
  });
  const balances = (data ?? []) as any[];
  if (!balances.length) return null;
  const colors = colorIndexesFor(balances.map((b) => b.name));

  return (
    <div className="mt-4">
      <h2 className="mb-3 text-base font-bold tracking-tight">Supplier API wallets</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {balances.map((b) => {
          const style = supplierBadgeStyle(colors.get(String(b.name ?? "").trim()) ?? 0);
          const low = b.balance != null && b.balance <= 0;
          return (
            <div
              key={b.id}
              className="rounded-2xl border p-4 lg:p-5"
              style={{ borderColor: style.borderColor, backgroundColor: style.backgroundColor }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold" style={{ color: style.color }}>
                  {b.name}
                </p>
                <Wallet className="size-4 shrink-0" style={{ color: style.color }} />
              </div>
              {b.balance == null ? (
                <p className="mt-3 line-clamp-2 text-xs text-destructive">{b.error || "Balance unavailable"}</p>
              ) : (
                <>
                  <p
                    className={`mt-3 text-2xl font-extrabold tracking-tight tabular-nums lg:text-3xl ${low ? "text-destructive" : ""}`}
                  >
                    {b.balance} <span className="text-sm font-semibold text-muted-foreground">{b.currency}</span>
                  </p>
                  {low && <p className="mt-1 text-xs text-destructive">Top up to enable auto delivery</p>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
