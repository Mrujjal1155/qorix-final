import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type CSSProperties } from "react";
import { checkSupplierBalances, deliverOrder, listOrders, retryAutoDelivery, setOrderStatus } from "@/lib/admin.functions";
import { AdminShell, money } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

const FILTERS = ["all", "pending", "completed", "cancelled"] as const;

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

function OrdersPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [deliverFor, setDeliverFor] = useState<string>("");
  const [content, setContent] = useState("");

  const fetchOrders = useServerFn(listOrders);
  const deliver = useServerFn(deliverOrder);
  const changeStatus = useServerFn(setOrderStatus);
  const retryAuto = useServerFn(retryAutoDelivery);
  const fetchBalances = useServerFn(checkSupplierBalances);
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

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">#</th>
                <th>Source</th>
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
              {(data ?? []).map((o: any) => (
                <tr key={o.id} className="border-t border-border align-top">
                  <td className="py-2">{o.order_no}</td>
                  <td>
                    <Badge variant={o.source === "website" ? "default" : "secondary"}>{o.source ?? "telegram"}</Badge>
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
                    <Badge variant={o.status === "completed" ? "default" : "secondary"}>{o.status}</Badge>
                  </td>
                  <td className="space-x-1 text-right">
                    {o.status === "pending" && (
                      <>
                        {o.supplier_name && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={retrying === o.id}
                            onClick={() => runRetry(o.id)}
                          >
                            {retrying === o.id ? "Retrying…" : "Retry API"}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDeliverFor(o.id)}>
                          Deliver
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => changeStatus({ data: { id: o.id, status: "cancelled" } }).then(refresh)}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {deliverFor && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              Manual delivery{active ? ` — order #${active.order_no}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
              rows={6}
              placeholder={"Email: user@mail.com\nPassword: ******"}
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
          </CardContent>
        </Card>
      )}

    </AdminShell>
  );
}
