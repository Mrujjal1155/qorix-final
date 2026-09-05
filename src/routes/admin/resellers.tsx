import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminShell, AdminPanel, money } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  adjustResellerBalance,
  createReseller,
  deleteReseller,
  getResellerDetail,
  listResellers,
  rotateResellerKey,
  updateReseller,
} from "@/lib/reseller.functions";
import {
  deleteResellerApplication,
  listResellerApplications,
  setApplicationStatus,
} from "@/lib/reseller-apply.functions";
import { listTopUpRequests, reviewTopUpRequest } from "@/lib/reseller-portal.functions";
import { RESELLER_API_BASE, SITE_ORIGIN, productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/admin/resellers")({
  head: () => ({
    meta: [
      { title: "Resellers — Shop Bot Admin" },
      { name: "description", content: "Create reseller API accounts, top up balance and control API access to your full product catalogue." },
      { property: "og:title", content: "Resellers — Shop Bot Admin" },
      { property: "og:description", content: "Full control over reseller API keys, balance and orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResellersPage,
});

function ResellersPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listResellers);
  const create = useServerFn(createReseller);
  const update = useServerFn(updateReseller);
  const rotate = useServerFn(rotateResellerKey);
  const remove = useServerFn(deleteReseller);
  const adjust = useServerFn(adjustResellerBalance);

  const { data: resellers } = useQuery({ queryKey: ["resellers"], queryFn: () => fetchList() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["resellers"] });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [discount, setDiscount] = useState("0");
  const [openId, setOpenId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      await refresh();
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <AdminShell title="Resellers" subtitle="API accounts that resell your full catalogue — website & bot">
      <Tabs defaultValue="accounts" className="space-y-5">
        <TabsList>
          <TabsTrigger value="accounts">Reseller accounts</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="topups">Top-ups</TabsTrigger>
          <TabsTrigger value="docs">API documentation</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-5">
          <AdminPanel title="New reseller">
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1.4fr_0.7fr_auto]">
              <Input placeholder="Reseller name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input placeholder="Discount %" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              <Button
                onClick={() =>
                  run(async () => {
                    await create({ data: { name, email, discount_percent: Number(discount) || 0 } });
                    setName("");
                    setEmail("");
                    setDiscount("0");
                  }, "Reseller created")
                }
              >
                Create
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Discount % is taken off your retail price — that is the reseller's buying price.
            </p>
          </AdminPanel>

          <div className="space-y-4">
            {(resellers ?? []).map((r: any) => (
              <AdminPanel key={r.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold">
                      {r.name}
                      {r.is_active ? (
                        <Badge className="bg-success/15 text-success">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.email || "no email"} · {r.stats.orders} orders · {money(r.stats.spent)} spent
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-sm font-bold">
                      Balance {money(r.balance)}
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                      {openId === r.id ? "Close" : "Manage"}
                    </Button>
                  </div>
                </div>

                {openId === r.id && (
                  <div className="mt-4 space-y-4 border-t border-border/70 pt-4">
                    {/* Balance */}
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <Input
                        placeholder="Amount (USD)"
                        value={amounts[r.id] ?? ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                      />
                      <Button
                        onClick={() =>
                          run(async () => {
                            await adjust({ data: { id: r.id, amount: Math.abs(Number(amounts[r.id]) || 0) } });
                            setAmounts((a) => ({ ...a, [r.id]: "" }));
                          }, "Balance added")
                        }
                      >
                        Add balance
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          run(async () => {
                            await adjust({ data: { id: r.id, amount: -Math.abs(Number(amounts[r.id]) || 0) } });
                            setAmounts((a) => ({ ...a, [r.id]: "" }));
                          }, "Balance deducted")
                        }
                      >
                        Take back
                      </Button>
                    </div>

                    {/* API key */}
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <Input readOnly value={r.api_key} className="font-mono text-xs" />
                      <Button
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(r.api_key);
                          toast.success("API key copied");
                        }}
                      >
                        Copy
                      </Button>
                      <Button variant="secondary" onClick={() => run(() => rotate({ data: { id: r.id } }), "New API key generated")}>
                        Regenerate
                      </Button>
                    </div>

                    {/* Settings */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                        Account active
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(v) => run(() => update({ data: { id: r.id, is_active: v } }), "Updated")}
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                        Website API access
                        <Switch
                          checked={r.allow_website}
                          onCheckedChange={(v) => run(() => update({ data: { id: r.id, allow_website: v } }), "Updated")}
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                        Bot API access
                        <Switch
                          checked={r.allow_bot}
                          onCheckedChange={(v) => run(() => update({ data: { id: r.id, allow_bot: v } }), "Updated")}
                        />
                      </label>
                      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                        <span className="shrink-0">Discount %</span>
                        <Input
                          defaultValue={r.discount_percent}
                          className="h-8"
                          onBlur={(e) =>
                            run(() => update({ data: { id: r.id, discount_percent: Number(e.target.value) || 0 } }), "Discount updated")
                          }
                        />
                      </div>
                    </div>

                    <Textarea
                      defaultValue={r.notes ?? ""}
                      placeholder="Internal notes"
                      onBlur={(e) => run(() => update({ data: { id: r.id, notes: e.target.value } }), "Notes saved")}
                    />

                    <ResellerDetail id={r.id} />

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete reseller “${r.name}”? Their orders stay, the API key stops working.`))
                          run(() => remove({ data: { id: r.id } }), "Reseller deleted");
                      }}
                    >
                      Delete reseller
                    </Button>
                  </div>
                )}
              </AdminPanel>
            ))}
            {!resellers?.length && <p className="text-sm text-muted-foreground">No resellers yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="applications">
          <Applications />
        </TabsContent>

        <TabsContent value="topups">
          <TopUps />
        </TabsContent>

        <TabsContent value="docs">
          <ApiDocs />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function Applications() {
  const qc = useQueryClient();
  const fetchApps = useServerFn(listResellerApplications);
  const setStatus = useServerFn(setApplicationStatus);
  const removeApp = useServerFn(deleteResellerApplication);
  const { data: apps } = useQuery({ queryKey: ["resellerApplications"], queryFn: () => fetchApps() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["resellerApplications"] });

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      await refresh();
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const approve = async (a: any) => {
    try {
      const res: any = await setStatus({ data: { id: a.id, status: "approved" } });
      await refresh();
      if (res?.invite_url) {
        await navigator.clipboard.writeText(res.invite_url).catch(() => {});
        toast.success(
          res.emailed
            ? "Approved — invite email sent. Login link copied to clipboard."
            : "Approved — login link copied to clipboard. Send it to the reseller.",
        );
      } else {
        toast.success("Approved");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Requests sent from the public <span className="font-mono">/reseller</span> page. Approving creates the reseller
        account automatically and emails a registration link to{" "}
        <span className="font-mono">/reseller/start</span>. When they sign up with the same email, their reseller panel
        unlocks itself.
      </p>
      {(apps ?? []).map((a: any) => (
        <AdminPanel key={a.id}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {a.name}{" "}
                <Badge variant={a.status === "approved" ? "default" : a.status === "rejected" ? "destructive" : "secondary"}>
                  {a.status}
                </Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                {a.email}
                {a.telegram ? ` · ${a.telegram}` : ""}
                {a.website ? ` · ${a.website}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Channel: {a.channel} · Volume: {a.monthly_volume || "—"} · {new Date(a.created_at).toLocaleString()}
              </p>
              {a.message ? <p className="mt-2 whitespace-pre-wrap text-sm">{a.message}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => approve(a)}>
                {a.status === "approved" ? "Resend invite" : "Approve"}
              </Button>
              {a.status === "approved" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const url = productionUrlFor(`/reseller/start?email=${encodeURIComponent(a.email)}`);
                    navigator.clipboard.writeText(url).then(() => toast.success("Login link copied"));
                  }}
                >
                  Copy login link
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => act(() => setStatus({ data: { id: a.id, status: "rejected" } }), "Rejected")}
              >
                Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => act(() => removeApp({ data: { id: a.id } }), "Deleted")}
              >
                Delete
              </Button>
            </div>
          </div>
        </AdminPanel>
      ))}
      {!apps?.length && <p className="text-sm text-muted-foreground">No applications yet.</p>}
    </div>
  );
}

function TopUps() {
  const qc = useQueryClient();
  const fetchTopups = useServerFn(listTopUpRequests);
  const review = useServerFn(reviewTopUpRequest);
  const { data: rows } = useQuery({ queryKey: ["resellerTopups"], queryFn: () => fetchTopups() });

  const act = async (id: string, status: "approved" | "rejected") => {
    try {
      await review({ data: { id, status } });
      await qc.invalidateQueries({ queryKey: ["resellerTopups"] });
      await qc.invalidateQueries({ queryKey: ["resellers"] });
      toast.success(status === "approved" ? "Balance credited" : "Request rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Balance requests sent by resellers from their panel. Approving credits their wallet instantly.
      </p>
      {((rows as any[]) ?? []).map((t: any) => (
        <AdminPanel key={t.id}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {t.resellers?.name ?? "Reseller"}{" "}
                <Badge variant={t.status === "approved" ? "default" : t.status === "rejected" ? "destructive" : "secondary"}>
                  {t.status}
                </Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                {Number(t.amount).toFixed(2)} · {t.method}
                {t.txid ? ` · TXID ${t.txid}` : ""}
                {t.sender_info ? ` · ${t.sender_info}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.resellers?.email ?? "—"} · {new Date(t.created_at).toLocaleString()}
              </p>
            </div>
            {t.status === "pending" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => act(t.id, "approved")}>
                  Approve & credit
                </Button>
                <Button size="sm" variant="outline" onClick={() => act(t.id, "rejected")}>
                  Reject
                </Button>
              </div>
            )}
          </div>
        </AdminPanel>
      ))}
      {!((rows as any[]) ?? []).length && <p className="text-sm text-muted-foreground">No top-up requests yet.</p>}
    </div>
  );
}


function ResellerDetail({ id }: { id: string }) {
  const fetchDetail = useServerFn(getResellerDetail);
  const { data } = useQuery({ queryKey: ["resellerDetail", id], queryFn: () => fetchDetail({ data: { id } }) });
  if (!data) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border/70 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Recent orders</p>
        <div className="space-y-1 text-sm">
          {(data.orders ?? []).map((o: any) => (
            <div key={o.id} className="flex items-center gap-2">
              <span className="text-muted-foreground">#{o.order_no}</span>
              <span className="truncate">{o.quantity}× {o.product_name}</span>
              <span className="ml-auto shrink-0">{money(o.total)}</span>
              <Badge variant={o.status === "completed" ? "secondary" : "destructive"}>{o.status}</Badge>
            </div>
          ))}
          {!data.orders?.length && <p className="text-xs text-muted-foreground">No API orders yet.</p>}
        </div>
      </div>
      <div className="rounded-xl border border-border/70 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Wallet ledger</p>
        <div className="space-y-1 text-sm">
          {(data.transactions ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className={Number(t.amount) >= 0 ? "text-success" : "text-destructive"}>
                {Number(t.amount) >= 0 ? "+" : ""}
                {money(t.amount).replace("$-", "$")}
              </span>
              <span className="truncate text-muted-foreground">{t.note ?? t.type}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{money(t.balance_after)}</span>
            </div>
          ))}
          {!data.transactions?.length && <p className="text-xs text-muted-foreground">No transactions yet.</p>}
        </div>
      </div>
    </div>
  );
}

function ApiDocs() {
  const base = RESELLER_API_BASE;
  const block = (t: string) => (
    <pre className="overflow-x-auto rounded-lg border border-border/70 bg-card/60 p-3 text-xs">{t}</pre>
  );
  return (
    <AdminPanel title="Reseller API v1">
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Every request needs the reseller's key: <code className="font-mono">Authorization: Bearer &lt;api_key&gt;</code>. Orders
          are paid instantly from the reseller wallet balance; failed auto-deliveries are refunded automatically.
        </p>
        {block(`GET  ${base}/me                      → account + balance
GET  ${base}/products?channel=website  → catalogue (channel = website | bot | all)
GET  ${base}/products/{id}             → single product
POST ${base}/orders                    → buy (auto delivery)
GET  ${base}/orders                    → order history
GET  ${base}/orders/{id|order_no|ref}  → one order + delivered items
GET  ${base}/transactions              → wallet ledger`)}
        <p className="font-semibold">Place an order</p>
        {block(`curl -X POST ${base}/orders \\
  -H "Authorization: Bearer qxr_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "product_id": "<uuid>",
    "quantity": 1,
    "channel": "website",
    "external_ref": "your-order-123",
    "customer_email": "buyer@example.com"
  }'`)}
        <p className="font-semibold">Response</p>
        {block(`{
  "ok": true,
  "order": { "order_no": 1042, "status": "completed", "items": ["login:pass"] },
  "balance": 87.50
}`)}
        <p className="text-xs text-muted-foreground">
          Product payloads include image_url, description, important_note, quick_guide, delivery_time and live stock — enough to
          rebuild a full storefront. <code className="font-mono">external_ref</code> makes order creation idempotent.
        </p>
      </div>
    </AdminPanel>
  );
}
