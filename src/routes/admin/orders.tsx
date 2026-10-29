import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  deliverOrder,
  recheckOrderBinance,
  completeManualOrder,
  listOrders,
  markOrderPaid,
  refundOrderToWallet,
  retryAutoDelivery,
  setOrderStatus,
} from "@/lib/admin.functions";
import { AdminShell, money } from "@/components/AdminShell";
import { orderCode, normalizeOrderQuery } from "@/lib/order-code";
import { DEFAULT_ORDER_TIMEZONE } from "@/lib/order-time";
import { canRetryInhouseOrder } from "@/lib/order-retry";
import { resellerBadgeStyle, supplierBadgeStyle } from "@/lib/supplier-colors";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LayoutGrid, Store, Table2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({
    meta: [
      { title: "Orders — Shop Bot Admin" },
      { name: "description", content: "Review Telegram shop orders, deliver manual products and update order status." },
      { property: "og:title", content: "Orders — Shop Bot Admin" },
      { property: "og:description", content: "Order management and manual delivery for your Telegram bot store." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

const FILTERS = ["all", "awaiting_payment", "pending", "completed", "failed", "refunded", "cancelled"] as const;

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "awaiting payment",
  failed: "failed / unpaid",
  refunded: "refunded",
};

const SOURCES = [
  { id: "all", label: "All orders" },
  { id: "telegram", label: "Telegram orders" },
  { id: "website", label: "Website orders" },
] as const;

const GATEWAY_LABEL: Record<string, string> = {
  eps_mfs: "EPS · Mobile banking (bKash / Nagad / Rocket)",
  eps_card: "EPS · Card (Visa / Mastercard)",
  eps: "EPS gateway",
  oxapay: "Crypto (OxaPay)",
  payid: "Binance Pay ID",
  binance: "Binance Pay",
  wallet: "Wallet balance",
  balance: "Wallet balance",
};

const SOURCE_LABEL: Record<string, string> = {
  telegram: "telegram",
  website: "website",
  api_website: "reseller API",
  api_bot: "reseller bot API",
};

/** What the buyer used to pay — works for both initiated and completed payments. */
function fmtOrderTime(v: string | null | undefined) {
  if (!v) return "";
  return new Date(v).toLocaleString("en-GB", {
    timeZone: DEFAULT_ORDER_TIMEZONE,
    timeZoneName: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function paymentInfo(o: any): { label: string; detail: string; paid: boolean; refunded: boolean } {
  const meta: any = o?.meta ?? {};
  const gateway = String(meta.gateway ?? "");
  const entity = String(meta.eps_entity ?? "");
  const channel = String(meta.channel ?? "");

  const label =
    (o.payment_method ? String(o.payment_method) : "") ||
    GATEWAY_LABEL[gateway] ||
    (gateway ? gateway.replace(/_/g, " ") : "") ||
    (o.source === "website" ? "Website checkout" : "Wallet balance");

  // Payment is a fact about the money, not about the current order status —
  // cancelling or refunding an order must never turn "paid" back into "not paid".
  const paid =
    Boolean(meta.paid) ||
    Boolean(meta.eps_paid) ||
    Boolean(meta.paid_at) ||
    o.status === "completed" ||
    o.status === "refunded" ||
    // Website orders are paid only when a gateway/admin verified the money
    // (meta flags above). A typed-in TXID alone proves nothing.
    (o.status === "pending" && o.source !== "website" && !meta.awaiting_payment);

  const refunded = Boolean(meta.refunded);

  const detail = [
    entity ? `paid with ${entity}` : channel ? `channel ${channel}` : "",
    meta.paid_bdt ? `৳${meta.paid_bdt}` : meta.bdt ? `৳${meta.bdt} due` : "",
    refunded ? `refunded $${Number(meta.refund_amount ?? o.total ?? 0).toFixed(2)} to wallet` : "",
    o.txid ? `TX ${String(o.txid)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return { label, detail, paid, refunded };
}

function OrdersPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [deliverFor, setDeliverFor] = useState<string>("");
  const [content, setContent] = useState("");
  const [refundFor, setRefundFor] = useState<string>("");
  const [cancelFor, setCancelFor] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");

  const fetchOrders = useServerFn(listOrders);
  const deliver = useServerFn(deliverOrder);
  const completeManual = useServerFn(completeManualOrder);
  const [manualOnly, setManualOnly] = useState(false);
  const changeStatus = useServerFn(setOrderStatus);
  const retryAuto = useServerFn(retryAutoDelivery);
  const markPaid = useServerFn(markOrderPaid);
  const refund = useServerFn(refundOrderToWallet);
  const [retrying, setRetrying] = useState<string>("");
  const [view, setView] = useState<"cards" | "table">("cards");

  // The chosen view is browser state, so it is restored after hydration.
  useEffect(() => {
    const saved = localStorage.getItem("qorix-orders-view");
    if (saved === "cards" || saved === "table") setView(saved);
  }, []);

  function changeView(v: "cards" | "table") {
    setView(v);
    localStorage.setItem("qorix-orders-view", v);
  }


  const runRetry = async (id: string) => {
    setRetrying(id);
    try {
      const r: any = await retryAuto({ data: { id } });
      if (r?.ok) toast.success("Order delivered successfully");
      else toast.error(r?.reason ?? "Auto delivery failed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto delivery failed");
    } finally {
      setRetrying("");
    }
  };

  const { data } = useQuery({
    queryKey: ["orders", status, source],
    queryFn: () => fetchOrders({ data: { status, source } }),
    // Keep the last list on screen while switching filters or refreshing.
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
  const supplierColorIndexes = useMemo(() => {
    const names = Array.from(
      new Set<string>((data ?? []).map((order: any) => String(order.supplier_name ?? "")).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));

    return new Map(names.map((name, index) => [name, index]));
  }, [data]);
  const supplierStyle = (name: string) => supplierBadgeStyle(supplierColorIndexes.get(name) ?? 0);
  const resellerColorIndexes = useMemo(() => {
    const names = Array.from(
      new Set<string>((data ?? []).map((order: any) => String(order.reseller_name ?? "")).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));

    return new Map(names.map((name, index) => [name, index]));
  }, [data]);
  const resellerStyle = (name: string) => resellerBadgeStyle(resellerColorIndexes.get(name) ?? 0);
  const rows = useMemo(() => {
    const q = normalizeOrderQuery(search);
    const base = ((data ?? []) as any[]).filter(
      (o: any) => !manualOnly || (o.delivery_type === "manual" && (o.status === "pending" || o.status === "processing")),
    );
    if (!q) return base;
    return base.filter((o: any) => {
      const code = orderCode(o.id);
      return (
        code.includes(q) ||
        String(o.order_no ?? "").includes(q) ||
        String(o.customer_email ?? "").toUpperCase().includes(q) ||
        String(o.telegram_id ?? "").includes(q) ||
        String(o.txid ?? "").toUpperCase().includes(q)
      );
    });
  }, [data, search, manualOnly]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["orders"] });
  const active = (data ?? []).find((o: any) => o.id === deliverFor) as any;


  const recheckFn = useServerFn(recheckOrderBinance);
  async function recheckBinance(id: string) {
    try {
      const r: any = await recheckFn({ data: { id } });
      if (r?.status === "verified") toast.success("Payment found on Binance");
      else toast.warning(r?.status === "error" ? "Could not reach Binance" : "Payment not confirmed on Binance");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  const binanceUnverified = active?.source === "website" && !!active?.txid && active?.meta?.binance?.status !== "verified";

  const deliverMut = useMutation({
    mutationFn: () =>
      active?.delivery_type === "manual"
        ? completeManual({ data: { id: deliverFor, note: content } })
        : deliver({ data: { id: deliverFor, content } }),
    onSuccess: () => {
      setDeliverFor("");
      setContent("");
      refresh();
      toast.success("Delivered and sent to the user");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copyCode(id: string) {
    navigator.clipboard.writeText(orderCode(id));
    toast.success("Order ID copied");
  }

  function rowActions(o: any) {
    return (
      <>
        {o.status !== "completed" && o.status !== "refunded" && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDeliverFor(o.id);
                setContent("");
              }}
            >
              Deliver now
            </Button>
            {(o.supplier_name || canRetryInhouseOrder(o, paymentInfo(o))) && (
              <Button size="sm" variant="ghost" disabled={retrying === o.id} onClick={() => runRetry(o.id)}>
                {retrying === o.id ? "Retrying…" : o.supplier_name ? "Retry API" : "Retry"}
              </Button>
            )}
          </>
        )}

        {(o.status === "awaiting_payment" || o.status === "failed" || o.status === "cancelled") && (
          <>
            {!paymentInfo(o).paid && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy === o.id}
              onClick={async () => {
                setBusy(o.id);
                try {
                  await markPaid({ data: { id: o.id } });
                  toast.success("Order reopened — deliver it now");
                  refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                } finally {
                  setBusy("");
                }
              }}
            >
              Mark paid
            </Button>
            )}
            {o.status !== "awaiting_payment" && paymentInfo(o).paid && !paymentInfo(o).refunded && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRefundFor(o.id);
                  setRefundAmount(String(Number(o.total ?? 0).toFixed(2)));
                }}
              >
                Refund
              </Button>
            )}
          </>
        )}
        {o.status === "pending" && (
          <>

            <Button
              size="sm"
              variant="ghost"
              disabled={busy === o.id}
              onClick={() => setCancelFor(o)}
            >
              {busy === o.id ? "Cancelling…" : "Cancel"}
            </Button>
          </>
        )}
      </>
    );
  }

  return (
    <AdminShell title="Orders">
      <div className="mb-3 flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <Button key={s.id} size="sm" variant={source === s.id ? "default" : "outline"} onClick={() => setSource(s.id)}>
            {s.label}
          </Button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={status === f ? "default" : "outline"} onClick={() => setStatus(f)}>
            {f}
          </Button>
        ))}
        <Button size="sm" variant={manualOnly ? "default" : "outline"} onClick={() => setManualOnly(!manualOnly)}>
          Manual pending
        </Button>
      </div>


      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order ID (ORD-XXXXXXXX), #order no, email, telegram id or TX"
          />
          {search && (
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length} order(s) matched “{search}”.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
          <Button
            size="sm"
            variant={view === "cards" ? "default" : "ghost"}
            className="gap-1.5"
            onClick={() => changeView("cards")}
          >
            <LayoutGrid className="size-4" />
            Cards
          </Button>
          <Button
            size="sm"
            variant={view === "table" ? "default" : "ghost"}
            className="gap-1.5"
            onClick={() => changeView("table")}
          >
            <Table2 className="size-4" />
            Table
          </Button>
        </div>
      </div>

      {/* Cards view — one order, one clearly separated card */}
      {view === "cards" && (
        <div className="space-y-3.5">
          {rows.map((o: any) => (
            <OrderCard
              key={o.id}
              o={o}
              actions={rowActions(o)}
              onCopy={copyCode}
              onRecheck={recheckBinance}
              supplierStyle={supplierStyle}
              resellerStyle={resellerStyle}
            />
          ))}
          {!rows.length && <p className="text-sm text-muted-foreground">No orders found.</p>}
        </div>
      )}

      {/* Table view — the same data as a dense grid */}
      {view === "table" && (
        <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">#</th>
                <th>Order ID</th>
                <th>Source</th>
                <th>Payment</th>
                <th>Supplier</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Profit</th>
                <th>Type</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o: any) => {
                const pay = paymentInfo(o);
                return (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="py-2">{o.order_no}</td>
                    <td>
                      <button
                        type="button"
                        className="rounded bg-muted px-2 py-1 font-mono text-xs hover:bg-muted/70"
                        title="Copy order ID"
                        onClick={() => copyCode(o.id)}
                      >
                        {orderCode(o.id)}
                      </button>
                      <div className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground" title={new Date(o.created_at).toString()}>
                        {fmtOrderTime(o.created_at)}
                      </div>
                    </td>
                    <td>
                      <Badge variant={o.source === "website" ? "default" : "secondary"}>{SOURCE_LABEL[o.source] ?? o.source ?? "telegram"}</Badge>
                      {(o.source === "api_website" || o.source === "api_bot") && (
                        <Badge
                          variant="outline"
                          title="Ordered through this reseller's API"
                          className="mt-1 gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                          style={resellerStyle(String(o.reseller_name ?? ""))}
                        >
                          <Store className="size-3" />
                          {o.reseller_name ?? "Unknown reseller"}
                        </Badge>
                      )}
                    </td>
                    <td>
                      <div className="text-xs">
                        <div className="font-medium">{pay.label}</div>
                        <div className={pay.paid ? "text-success" : "text-muted-foreground"}>
                          {pay.paid ? "paid" : "not paid"}
                          {pay.refunded ? " · refunded" : ""}
                        </div>
                        {pay.detail && <div className="max-w-[12rem] break-all text-muted-foreground">{pay.detail}</div>}
                      </div>
                    </td>
                    <td>
                      {o.supplier_name ? (
                        <div className="text-xs">
                          <Badge variant="outline" style={supplierStyle(o.supplier_name)}>
                            API · {o.supplier_name}
                          </Badge>
                          {o.supplier_external_id && (
                            <div className="mt-1 text-muted-foreground">ID: {o.supplier_external_id}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Own stock</span>
                      )}
                    </td>
                    <td>
                      {o.source === "website" ? (
                        <div className="text-xs">
                          <div>{o.customer_name}</div>
                          <div className="text-muted-foreground">{o.customer_email}{o.buyer_order_count ? <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]" title="Total orders by this buyer">{o.buyer_order_count}x</Badge> : null}</div>
                          {o.txid && <div className="text-muted-foreground">TX: {String(o.txid).slice(0, 18)}…</div>}
                          <BinanceCheckBadge o={o} onRecheck={() => recheckBinance(o.id)} />
                        </div>
                       ) : (
                         <div className="text-xs">
                           <div>{o.telegram_id}{o.buyer_order_count ? <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]" title="Total orders by this buyer">{o.buyer_order_count}x</Badge> : null}</div>
                           {o.buyer_username && (
                             <a
                               className="text-primary underline"
                               href={`https://t.me/${o.buyer_username}`}
                               target="_blank"
                               rel="noreferrer"
                             >
                               @{o.buyer_username}
                             </a>
                           )}
                           {o.buyer_name && <div className="text-muted-foreground">{o.buyer_name}</div>}
                         </div>
                       )}
                    </td>
                    <td>
                      {o.product_name} {o.delivery_type === "manual" && <Badge variant="destructive" className="ml-1 align-middle text-[10px]">MANUAL</Badge>}
                      {Array.isArray(o.meta?.manual_input) && o.meta.manual_input.length > 0 && (
                        <pre className="mt-1 max-w-xs overflow-x-auto rounded border border-border bg-background p-2 text-xs">{o.meta.manual_input.join("\n")}</pre>
                      )}
                      {o.delivered_content && <DeliveryToggle content={o.delivered_content} narrow />}
                      {o.status !== "completed" && o.meta?.supplier_error && (
                        <div className="mt-1 max-w-xs rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                          <span className="font-semibold">Supplier failed:</span> {String(o.meta.supplier_error)}
                        </div>
                      )}
                    </td>
                    <td>{o.quantity}</td>
                    <td>{money(o.total)}</td>
                    <td>
                      {o.status === "completed" ? (
                        <span className={Number(o.profit ?? 0) >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                          {money(o.profit ?? 0)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>{o.delivery_type}</td>
                    <td>
                      <Badge
                        variant={
                          o.status === "completed" ? "default" : o.status === "failed" ? "destructive" : "secondary"
                        }
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                    </td>
                    <td className="space-x-1 text-right">{rowActions(o)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
        </Card>
      )}

      <Dialog open={!!deliverFor} onOpenChange={(open) => !open && setDeliverFor("")}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Manual delivery{active ? ` — order #${active.order_no} · ${orderCode(active.id)}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {active && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                <div>
                  Buyer: <b>{active.source === "website" ? active.customer_email : active.telegram_id}</b>
                </div>
                <div>
                  Product: <b>{active.quantity}× {active.product_name}</b>
                </div>
                <div>
                  Supply:{" "}
                   <b style={active.supplier_name ? { color: supplierStyle(active.supplier_name).color } : undefined}>{active.supplier_name ? `API · ${active.supplier_name}` : "Own stock (manual)"}</b>
                  {active.supplier_external_id ? ` · product ID ${active.supplier_external_id}` : ""}
                </div>
                {Array.isArray(active.meta?.manual_input) && active.meta.manual_input.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between">
                      <b>Customer info</b>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(active.meta.manual_input.join("\n"));
                          toast.success("Copied");
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded bg-background p-2">{active.meta.manual_input.join("\n")}</pre>
                  </div>
                )}
                {active.delivery_type === "manual" ? (
                  <div className="mt-1 text-muted-foreground">
                    Write a completion note (e.g. "Completed inviting user@gmail.com"). The buyer gets this note in Telegram
                    and the order is marked completed.
                  </div>
                ) : (
                <div className="mt-1 text-muted-foreground">
                  Paste {active.quantity} item(s) — one per line, or blocks separated by ---. Each item is sent
                  privately to this buyer only, then the order is marked completed.
                </div>
                )}
              </div>
            )}
            {binanceUnverified && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                ⚠️ This payment was not found on Binance. Check the Binance Transactions page before delivering.
                <BinanceCheckBadge o={active} onRecheck={() => recheckBinance(active.id)} />
              </div>
            )}
            <Textarea
              rows={7}
              placeholder={"Email: user@mail.com\nPassword: ******\nLogin link: https://..."}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (binanceUnverified && !window.confirm("Payment is NOT confirmed on Binance. Deliver anyway?")) return;
                  deliverMut.mutate();
                }}
                disabled={!content.trim() || deliverMut.isPending}>
                {deliverMut.isPending ? "Sending…" : active?.delivery_type === "manual" ? "Complete order" : "Send to user & complete"}
              </Button>
              <Button variant="outline" onClick={() => setDeliverFor("")}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!refundFor} onOpenChange={(open) => !open && setRefundFor("")}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refund to wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter exactly how much the buyer actually paid for this order. The amount is credited to their wallet and
              the order is marked refunded.
            </p>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="max-w-[12rem]"
            />
            <div className="flex gap-2">
              <Button
                disabled={busy === refundFor || !(Number(refundAmount) > 0)}
                onClick={async () => {
                  setBusy(refundFor);
                  try {
                    await refund({ data: { id: refundFor, amount: Number(refundAmount) } });
                    toast.success("Refunded to wallet");
                    setRefundFor("");
                    refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Refund failed");
                  } finally {
                    setBusy("");
                  }
                }}
              >
                Refund to wallet
              </Button>
              <Button variant="outline" onClick={() => setRefundFor("")}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelFor} onOpenChange={(open) => !open && setCancelFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Order <b>#{cancelFor?.order_no}</b> — {cancelFor?.product_name}
            </p>
            {(() => {
              const m = (cancelFor?.meta ?? {}) as any;
              const canRefund =
                !!cancelFor &&
                Number(cancelFor.telegram_id ?? 0) > 0 &&
                (Boolean(m.paid || m.eps_paid || m.paid_at) || cancelFor.source !== "website");
              const run = async (refund: boolean) => {
                const id = cancelFor?.id as string;
                setBusy(id);
                setCancelFor(null);
                try {
                  const r: any = await changeStatus({ data: { id, status: "cancelled", refund } });
                  if (r?.skipped) toast.info("This order was already cancelled");
                  else toast.success(refund ? "Order cancelled & refunded" : "Order cancelled (no refund)");
                  refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Cancel failed");
                } finally {
                  setBusy("");
                }
              };
              return (
                <>
                  <p className="text-xs text-muted-foreground">
                    {canRefund
                      ? `Choose: cancel without refund, or cancel and refund $${Number(cancelFor?.total ?? 0).toFixed(2)} to the buyer's wallet (sent once only).`
                      : "No verified payment on this order — it can only be cancelled without refund."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="destructive" disabled={busy === cancelFor?.id} onClick={() => run(false)}>
                      Cancel without refund
                    </Button>
                    {canRefund && (
                      <Button variant="default" disabled={busy === cancelFor?.id} onClick={() => run(true)}>
                        Cancel & refund
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => setCancelFor(null)}>
                      Keep order
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

    </AdminShell>
  );
}

function DeliveryToggle({ content, narrow }: { content: string; narrow?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`mt-1 ${narrow ? "max-w-xs" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary"
      >
        {open ? "Hide delivery details" : "Delivery details"}
      </button>
      {open && (
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{content}</pre>
      )}
    </div>
  );
}


function BinanceCheckBadge({ o, onRecheck }: { o: any; onRecheck?: () => void }) {
  if (o.source !== "website" || !o.txid) return null;
  const b = o.meta?.binance;
  const map: Record<string, { label: string; cls: string }> = {
    verified: { label: `✅ Found on Binance${b?.amount ? ` · ${b.amount} ${b.currency ?? "USDT"}` : ""}`, cls: "border-success/40 bg-success/10 text-success" },
    mismatch: { label: `⚠️ Amount mismatch${b?.amount ? ` · got ${b.amount} ${b.currency ?? ""}` : ""}`, cls: "border-destructive/40 bg-destructive/10 text-destructive" },
    used: { label: "⚠️ ID already used", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
    not_found: { label: "⚠️ Not found on Binance", cls: "border-warning/40 bg-warning/10 text-warning" },
    error: { label: "⏳ Binance check failed", cls: "border-warning/40 bg-warning/10 text-warning" },
  };
  const v = map[b?.status] ?? { label: "⏳ Not checked yet", cls: "border-border bg-muted text-muted-foreground" };
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${v.cls}`}>{v.label}</span>
      {onRecheck && b?.status !== "verified" && (
        <button type="button" className="text-[11px] text-primary underline" onClick={onRecheck}>
          Re-check
        </button>
      )}
    </div>
  );
}

/* ─── One order = one clearly separated card, on every screen size ─── */
const STATUS_TONE: Record<string, { bar: string; badge: "default" | "secondary" | "destructive" }> = {
  completed: { bar: "bg-success", badge: "default" },
  processing: { bar: "bg-warning", badge: "secondary" },
  pending: { bar: "bg-warning", badge: "secondary" },
  awaiting_payment: { bar: "bg-warning", badge: "secondary" },
  failed: { bar: "bg-destructive", badge: "destructive" },
  refunded: { bar: "bg-destructive", badge: "secondary" },
  cancelled: { bar: "bg-muted-foreground/40", badge: "secondary" },
};

function OrderField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="admin-order-field">
      <div className="admin-order-label">{label}</div>
      <div className="mt-1 min-w-0 break-words text-xs">{children}</div>
    </div>
  );
}

function OrderCard({
  o,
  actions,
  onCopy,
  onRecheck,
  supplierStyle,
  resellerStyle,
}: {
  o: any;
  actions: ReactNode;
  onCopy: (id: string) => void;
  onRecheck: (id: string) => void;
  supplierStyle: (name: string) => CSSProperties;
  resellerStyle: (name: string) => CSSProperties;
}) {
  const pay = paymentInfo(o);
  const tone = STATUS_TONE[String(o.status)] ?? { bar: "bg-primary", badge: "secondary" as const };
  const showActions = o.status !== "completed" && o.status !== "refunded";

  return (
    <article className="admin-order-card">
      <span className={cn("absolute inset-y-0 left-0 w-1", tone.bar)} aria-hidden="true" />

      <header className="admin-order-head">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="shrink-0 text-sm font-extrabold tracking-tight">#{o.order_no}</span>
            <button
              type="button"
              title="Copy order ID"
              onClick={() => onCopy(o.id)}
              className="min-w-0 max-w-full truncate rounded-md bg-muted px-2 py-1 font-mono text-xs transition-colors hover:bg-muted/70"
            >
              {orderCode(o.id)}
            </button>
            {o.delivery_type === "manual" && (
              <Badge variant="destructive" className="shrink-0 text-[10px]">
                MANUAL
              </Badge>
            )}
          </div>
          <div className="mt-1.5 truncate text-xs text-muted-foreground">{fmtOrderTime(o.created_at)}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={tone.badge}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
          <span className="text-sm font-bold text-gold">{money(o.total)}</span>
          {o.status === "completed" && (
            <span
              className={cn(
                "text-xs font-semibold",
                Number(o.profit ?? 0) >= 0 ? "text-success" : "text-destructive",
              )}
            >
              profit {money(o.profit ?? 0)}
            </span>
          )}
        </div>
      </header>

      <div className="admin-order-body">
        <div className="min-w-0 break-words text-sm font-semibold">
          {o.quantity}× {o.product_name}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={o.source === "website" ? "default" : "secondary"}>
            {SOURCE_LABEL[o.source] ?? o.source ?? "telegram"}
          </Badge>
          {(o.source === "api_website" || o.source === "api_bot") && (
            <Badge
              variant="outline"
              title="Ordered through this reseller's API"
              className="gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
              style={resellerStyle(String(o.reseller_name ?? ""))}
            >
              <Store className="size-3" />
              {o.reseller_name ?? "Unknown reseller"}
            </Badge>
          )}
          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
            {o.delivery_type}
          </span>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <OrderField label="Payment">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{pay.label}</span>
              <Badge variant={pay.paid ? "default" : "secondary"} className="text-[10px]">
                {pay.paid ? "paid" : "not paid"}
              </Badge>
              {pay.refunded && (
                <Badge variant="outline" className="text-[10px]">
                  refunded
                </Badge>
              )}
            </div>
            {pay.detail && <div className="mt-1 break-all text-muted-foreground">{pay.detail}</div>}
          </OrderField>

          <OrderField label="Customer">
            {o.source === "website" ? (
              <>
                <div className="break-all">{o.customer_name}</div>
                <div className="break-all text-muted-foreground">{o.customer_email}{o.buyer_order_count ? <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]" title="Total orders by this buyer">{o.buyer_order_count}x</Badge> : null}</div>
                <BinanceCheckBadge o={o} onRecheck={() => onRecheck(o.id)} />
              </>
            ) : (
              <>
                <div className="break-all">Telegram: {o.telegram_id}{o.buyer_order_count ? <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]" title="Total orders by this buyer">{o.buyer_order_count}x</Badge> : null}</div>
                {o.buyer_username && (
                  <a
                    className="text-primary underline"
                    href={`https://t.me/${o.buyer_username}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{o.buyer_username}
                  </a>
                )}
                {o.buyer_name && <div className="break-all text-muted-foreground">{o.buyer_name}</div>}
              </>
            )}
          </OrderField>

          <OrderField label="Supply">
            {o.supplier_name ? (
              <>
                <Badge
                  variant="outline"
                  className="max-w-full truncate"
                  style={supplierStyle(String(o.supplier_name))}
                >
                  API · {o.supplier_name}
                </Badge>
                {o.supplier_external_id && (
                  <div className="mt-1 break-all text-muted-foreground">ID: {o.supplier_external_id}</div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Own stock</span>
            )}
          </OrderField>
        </div>

        {Array.isArray(o.meta?.manual_input) && o.meta.manual_input.length > 0 && (
          <pre className="max-w-full overflow-x-auto rounded-lg border border-border bg-background p-2 text-xs">
            {o.meta.manual_input.join("\n")}
          </pre>
        )}

        {o.status !== "completed" && o.meta?.supplier_error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            <span className="font-semibold">Supplier failed:</span> {String(o.meta.supplier_error)}
          </div>
        )}

        {o.delivered_content && <DeliveryToggle content={o.delivered_content} />}
      </div>

      {showActions && <footer className="admin-order-foot">{actions}</footer>}
    </article>
  );
}
