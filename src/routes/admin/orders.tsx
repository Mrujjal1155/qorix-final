import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type CSSProperties } from "react";
import {
  checkSupplierBalances,
  deliverOrder,
  listOrders,
  markOrderPaid,
  refundOrderToWallet,
  retryAutoDelivery,
  setOrderStatus,
} from "@/lib/admin.functions";
import { AdminShell, money } from "@/components/AdminShell";
import { orderCode, normalizeOrderQuery } from "@/lib/order-code";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const SUPPLIER_HUES = [18, 145, 255, 320, 75, 195, 285, 45, 225, 350] as const;

function supplierBadgeStyle(index: number): CSSProperties {
  const h = SUPPLIER_HUES[index % SUPPLIER_HUES.length];
  return {
    color: `oklch(0.72 0.16 ${h})`,
    borderColor: `oklch(0.72 0.16 ${h} / 0.55)`,
    backgroundColor: `oklch(0.72 0.16 ${h} / 0.12)`,
  };
}

const SOURCES = [
  { id: "all", label: "All orders" },
  { id: "telegram", label: "Telegram orders" },
  { id: "website", label: "Website orders" },
] as const;

const GATEWAY_LABEL: Record<string, string> = {
  eps_mfs: "EPS · Mobile banking (bKash / Nagad / Rocket)",
  eps_card: "EPS · Card (Visa / Mastercard)",
  eps: "EPS gateway",
  payid: "Binance Pay ID",
  binance: "Binance Pay",
  wallet: "Wallet balance",
  balance: "Wallet balance",
};

/** What the buyer used to pay — works for both initiated and completed payments. */
function paymentInfo(o: any): { label: string; detail: string; paid: boolean } {
  const meta: any = o?.meta ?? {};
  const gateway = String(meta.gateway ?? "");
  const entity = String(meta.eps_entity ?? "");
  const channel = String(meta.channel ?? "");

  const label =
    (o.payment_method ? String(o.payment_method) : "") ||
    GATEWAY_LABEL[gateway] ||
    (gateway ? gateway.replace(/_/g, " ") : "") ||
    (o.source === "website" ? "Website checkout" : "Wallet balance");

  const paid =
    Boolean(meta.eps_paid) ||
    o.status === "completed" ||
    o.status === "refunded" ||
    (o.status === "pending" && !meta.awaiting_payment);

  const detail = [
    entity ? `paid with ${entity}` : channel ? `channel ${channel}` : "",
    meta.paid_bdt ? `৳${meta.paid_bdt}` : meta.bdt ? `৳${meta.bdt} due` : "",
    o.txid ? `TX ${String(o.txid)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return { label, detail, paid };
}

function OrdersPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [deliverFor, setDeliverFor] = useState<string>("");
  const [content, setContent] = useState("");
  const [refundFor, setRefundFor] = useState<string>("");
  const [refundAmount, setRefundAmount] = useState("");
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");

  const fetchOrders = useServerFn(listOrders);
  const deliver = useServerFn(deliverOrder);
  const changeStatus = useServerFn(setOrderStatus);
  const retryAuto = useServerFn(retryAutoDelivery);
  const fetchBalances = useServerFn(checkSupplierBalances);
  const markPaid = useServerFn(markOrderPaid);
  const refund = useServerFn(refundOrderToWallet);
  const [retrying, setRetrying] = useState<string>("");

  const { data: balances } = useQuery({
    queryKey: ["supplier-balances"],
    queryFn: () => fetchBalances({}),
    refetchInterval: 120000,
  });

  const runRetry = async (id: string) => {
    setRetrying(id);
    try {
      const r: any = await retryAuto({ data: { id } });
      if (r?.ok) toast.success("Supplier API delivered the order");
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
  });
  const supplierColorIndexes = useMemo(() => {
    const names = Array.from(
      new Set<string>((data ?? []).map((order: any) => String(order.supplier_name ?? "")).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));

    return new Map(names.map((name, index) => [name, index]));
  }, [data]);
  const supplierStyle = (name: string) => supplierBadgeStyle(supplierColorIndexes.get(name) ?? 0);
  const rows = useMemo(() => {
    const q = normalizeOrderQuery(search);
    if (!q) return (data ?? []) as any[];
    return ((data ?? []) as any[]).filter((o: any) => {
      const code = orderCode(o.id);
      return (
        code.includes(q) ||
        String(o.order_no ?? "").includes(q) ||
        String(o.customer_email ?? "").toUpperCase().includes(q) ||
        String(o.telegram_id ?? "").includes(q) ||
        String(o.txid ?? "").toUpperCase().includes(q)
      );
    });
  }, [data, search]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["orders"] });
  const active = (data ?? []).find((o: any) => o.id === deliverFor) as any;


  const deliverMut = useMutation({
    mutationFn: () => deliver({ data: { id: deliverFor, content } }),
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
            <Button size="sm" variant="ghost" disabled={retrying === o.id} onClick={() => runRetry(o.id)}>
              {retrying === o.id ? "Retrying…" : "Retry API"}
            </Button>
          </>
        )}

        {(o.status === "awaiting_payment" || o.status === "failed") && (
          <>
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
          </>
        )}
        {o.status === "pending" && (
          <>
            {o.supplier_name && (
              <Button size="sm" variant="ghost" disabled={retrying === o.id} onClick={() => runRetry(o.id)}>
                {retrying === o.id ? "Retrying…" : "Retry API"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => changeStatus({ data: { id: o.id, status: "cancelled" } }).then(refresh)}
            >
              Cancel
            </Button>
          </>
        )}
      </>
    );
  }

  return (
    <AdminShell title="Orders">
      <div className="mb-3 flex gap-2">
        {SOURCES.map((s) => (
          <Button key={s.id} size="sm" variant={source === s.id ? "default" : "outline"} onClick={() => setSource(s.id)}>
            {s.label}
          </Button>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={status === f ? "default" : "outline"} onClick={() => setStatus(f)}>
            {f}
          </Button>
        ))}
      </div>

      {!!balances?.length && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Supplier API wallets</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            {balances.map((b: any) => (
              <div key={b.id} className="rounded-lg border border-border px-3 py-2">
                <div className="font-medium">{b.name}</div>
                {b.balance == null ? (
                  <div className="text-xs text-destructive">{b.error}</div>
                ) : (
                  <div className={b.balance <= 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {b.balance} {b.currency}
                    {b.balance <= 0 ? " — top up to enable auto delivery" : ""}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mb-4 max-w-md">
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

      {/* Mobile: one card per order */}
      <div className="space-y-3 md:hidden">
        {rows.map((o: any) => {
          const pay = paymentInfo(o);
          return (
            <Card key={o.id}>
              <CardContent className="space-y-3 pt-5 text-sm">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">#{o.order_no}</div>
                    <button
                      type="button"
                      className="mt-1 rounded bg-muted px-2 py-1 font-mono text-xs"
                      onClick={() => copyCode(o.id)}
                    >
                      {orderCode(o.id)}
                    </button>
                  </div>
                  <Badge
                    className="shrink-0"
                    variant={o.status === "completed" ? "default" : o.status === "failed" ? "destructive" : "secondary"}
                  >
                    {STATUS_LABEL[o.status] ?? o.status}
                  </Badge>
                </div>

                <div className="min-w-0 break-words">
                  {o.quantity}× {o.product_name}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={o.source === "website" ? "default" : "secondary"}>{o.source ?? "telegram"}</Badge>
                  <span>{money(o.total)}</span>
                  <span>{o.delivery_type}</span>
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/40 p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{pay.label}</span>
                    <Badge variant={pay.paid ? "default" : "secondary"}>{pay.paid ? "paid" : "not paid"}</Badge>
                  </div>
                  {pay.detail && <div className="mt-1 break-all text-muted-foreground">{pay.detail}</div>}
                </div>

                <div className="text-xs text-muted-foreground">
                  {o.source === "website" ? (
                    <>
                      <div className="break-all">{o.customer_name}</div>
                      <div className="break-all">{o.customer_email}</div>
                    </>
                  ) : (
                    <div>Telegram: {o.telegram_id}</div>
                  )}
                  {o.supplier_name ? (
                    <div className="mt-1">
                      API · {o.supplier_name}
                      {o.supplier_external_id ? ` · ${o.supplier_external_id}` : ""}
                    </div>
                  ) : (
                    <div className="mt-1">Own stock</div>
                  )}
                </div>

                {o.delivered_content && (
                  <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{o.delivered_content}</pre>
                )}

                <div className="flex flex-wrap gap-2">{rowActions(o)}</div>
              </CardContent>
            </Card>
          );
        })}
        {!rows.length && <p className="text-sm text-muted-foreground">No orders found.</p>}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
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
                    </td>
                    <td>
                      <Badge variant={o.source === "website" ? "default" : "secondary"}>{o.source ?? "telegram"}</Badge>
                    </td>
                    <td>
                      <div className="text-xs">
                        <div className="font-medium">{pay.label}</div>
                        <div className={pay.paid ? "text-success" : "text-muted-foreground"}>
                          {pay.paid ? "paid" : "not paid"}
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
                          <div className="text-muted-foreground">{o.customer_email}</div>
                          {o.txid && <div className="text-muted-foreground">TX: {String(o.txid).slice(0, 18)}…</div>}
                        </div>
                      ) : (
                        o.telegram_id
                      )}
                    </td>
                    <td>
                      {o.product_name}
                      {o.delivered_content && (
                        <pre className="mt-1 max-w-xs overflow-x-auto rounded bg-muted p-2 text-xs">
                          {o.delivered_content}
                        </pre>
                      )}
                    </td>
                    <td>{o.quantity}</td>
                    <td>{money(o.total)}</td>
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
                <div className="mt-1 text-muted-foreground">
                  Paste {active.quantity} item(s) — one per line, or blocks separated by ---. Each item is sent
                  privately to this buyer only, then the order is marked completed.
                </div>
              </div>
            )}
            <Textarea
              rows={7}
              placeholder={"Email: user@mail.com\nPassword: ******\nLogin link: https://..."}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={() => deliverMut.mutate()} disabled={!content.trim() || deliverMut.isPending}>
                {deliverMut.isPending ? "Sending…" : "Send to user & complete"}
              </Button>
              <Button variant="outline" onClick={() => setDeliverFor("")}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {refundFor && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Refund to wallet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>
      )}

    </AdminShell>
  );
}
