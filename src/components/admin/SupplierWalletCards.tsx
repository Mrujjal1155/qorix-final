import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet } from "lucide-react";
import { checkSupplierBalances } from "@/lib/admin.functions";
import { colorIndexesFor, supplierBadgeStyle } from "@/lib/supplier-colors";

/**
 * Compact supplier wallet strip shown at the very end of the dashboard scroll.
 * Each supplier keeps its shared admin colour; layout stays tight on phones
 * (2 columns) and spreads out on tablets and desktops.
 */
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
    <div className="mt-8 border-t border-border/70 pt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Supplier API balances
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {balances.map((b) => {
          const style = supplierBadgeStyle(colors.get(String(b.name ?? "").trim()) ?? 0);
          const low = b.balance != null && b.balance <= 0;
          return (
            <div
              key={b.id}
              className="min-w-0 rounded-xl border px-3 py-2"
              style={{ borderColor: style.borderColor, backgroundColor: style.backgroundColor }}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <Wallet className="size-3 shrink-0" style={{ color: style.color }} />
                <p className="min-w-0 truncate text-xs font-semibold" style={{ color: style.color }}>
                  {b.name}
                </p>
              </div>
              {b.balance == null ? (
                <p className="mt-1 truncate text-[11px] text-destructive" title={b.error || "Balance unavailable"}>
                  {b.error || "Balance unavailable"}
                </p>
              ) : (
                <p
                  className={`mt-0.5 truncate text-base font-extrabold leading-tight tracking-tight tabular-nums ${
                    low ? "text-destructive" : ""
                  }`}
                  title={low ? "Top up to enable auto delivery" : undefined}
                >
                  {b.balance} <span className="text-[11px] font-semibold text-muted-foreground">{b.currency}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
