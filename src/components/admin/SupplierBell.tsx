import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { listSupplierAlerts, clearSupplierAlerts, syncAllSuppliersNow } from "@/lib/supplier.functions";

const SEEN_KEY = "qorix_supplier_alerts_seen";

type Alert = {
  id: string;
  at: string;
  kind: "new" | "restock";
  supplier: string;
  product: string;
  qty: number;
  listed: boolean;
};

function ago(iso: string) {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function SupplierBell() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const fetchAlerts = useServerFn(listSupplierAlerts);
  const clearFn = useServerFn(clearSupplierAlerts);
  const syncFn = useServerFn(syncAllSuppliersNow);

  const { data } = useQuery({
    queryKey: ["supplier-alerts"],
    queryFn: () => fetchAlerts() as Promise<Alert[]>,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const alerts = (data ?? []) as Alert[];

  useEffect(() => {
    setSeen(Number(localStorage.getItem(SEEN_KEY) || 0));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = useMemo(
    () => alerts.filter((a) => Date.parse(a.at) > seen).length,
    [alerts, seen],
  );

  const sync = useMutation({
    mutationFn: () => syncFn() as Promise<any>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplier-alerts"] }),
  });
  const clear = useMutation({
    mutationFn: () => clearFn() as Promise<any>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplier-alerts"] }),
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      const now = Date.now();
      localStorage.setItem(SEEN_KEY, String(now));
      setSeen(now);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={toggle}
        aria-label="Supplier notifications"
        className="relative grid size-9 place-items-center rounded-full bg-primary/15 text-primary"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-brand-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
            <p className="text-sm font-semibold">Supplier updates</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
                title="Check suppliers now"
                className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {sync.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </button>
              <button
                onClick={() => clear.mutate()}
                title="Clear all"
                className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No supplier updates yet.
              </p>
            )}
            {alerts.map((a, i) => (
              <div key={`${a.id}-${i}`} className="flex gap-3 border-b border-border/50 px-4 py-3 last:border-0">
                <span
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-xs ${
                    a.kind === "new" ? "bg-brand/15 text-brand" : "bg-success/15 text-success"
                  }`}
                >
                  {a.kind === "new" ? "🆕" : "📦"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.product}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.kind === "new" ? "New product" : `Restocked +${a.qty}`} · {a.supplier}
                    {a.kind === "new" && !a.listed ? " · off (not listed)" : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70">{ago(a.at)}</p>
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/admin/suppliers"
            onClick={() => setOpen(false)}
            className="block border-t border-border/70 px-4 py-3 text-center text-sm font-medium text-primary hover:bg-secondary/60"
          >
            Open Supplier APIs
          </Link>
        </div>
      )}
    </div>
  );
}
