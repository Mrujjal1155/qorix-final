import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Bot,
  Copy,
  Globe,
  KeyRound,
  RefreshCw,
  ShoppingBag,
  Timer,
  TrendingUp,
  Wallet,
  Wrench,

} from "lucide-react";
import {
  checkAutoTopUp,
  getResellerPanel,
  getResellerCatalogue,
  listTopupMethods,
  requestTopUp,
  rotateMyApiKey,
  startAutoTopUp,
  updateMySiteSettings,
  updateMyWebhook,
} from "@/lib/reseller-portal.functions";
import { priceTag } from "@/components/StoreShell";
import { ResellerShell, type ResellerTab } from "@/components/ResellerShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SITE_ORIGIN } from "@/lib/site-url";

const RESELLER_TABS: ResellerTab[] = [
  "analytics",
  "reports",
  "orders",
  "catalogue",
  "balance",
  "api",
  "site",
];

export const Route = createFileRoute("/_authenticated/reseller/panel")({
  validateSearch: (search: Record<string, unknown>): { tab?: ResellerTab } => {
    const t = String(search["tab"] ?? "");
    return (RESELLER_TABS as string[]).includes(t) ? { tab: t as ResellerTab } : {};
  },
  head: () => ({
    meta: [
      { title: "Reseller panel — QORIX Store" },
      { name: "description", content: "Your reseller dashboard: analytics, API key, balance and order history." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Reseller panel — QORIX Store" },
      { property: "og:description", content: "Reseller analytics, API key and balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResellerPanel,
});

function copy(text: string, label = "Copied") {
  navigator.clipboard.writeText(text).then(() => toast.success(label));
}

const PANEL_CACHE_KEY = "qorix.reseller.panel.snapshot";
const DEV_MODE_KEY = "qorix.reseller.devmode";

function readCache(): any | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PANEL_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(data: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PANEL_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* storage full or blocked — ignore */
  }
}

function ResellerPanel() {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const { tab: tabParam } = Route.useSearch();
  const tab: ResellerTab = tabParam ?? "analytics";
  const setTab = (next: ResellerTab) => {
    void navigate({ search: next === "analytics" ? {} : { tab: next }, replace: true });
  };
  const fetchPanel = useServerFn(getResellerPanel);
  const [devMode, setDevMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DEV_MODE_KEY) === "1";
  });

  const { data: live, isLoading, error } = useQuery({
    queryKey: ["reseller-panel"],
    queryFn: async () => {
      const res = await fetchPanel();
      writeCache(res);
      return res;
    },
    retry: devMode ? 0 : 1,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["reseller-panel"] });

  const cached = !live ? readCache() : null;
  const offline = !live && !!cached && (!!error || devMode);
  const data: any = live ?? (offline ? cached.data : null);
  const cachedAt = offline ? new Date(cached.at).toLocaleString() : "";

  const toggleDev = () => {
    const next = !devMode;
    setDevMode(next);
    if (typeof window !== "undefined") window.localStorage.setItem(DEV_MODE_KEY, next ? "1" : "0");
    toast.success(next ? "Dev mode on — panel uses last saved snapshot when the server is unreachable" : "Dev mode off");
    refresh();
  };

  if (!data) {
    if (isLoading) {
      return (
        <div className="admin-theme min-h-screen">
          <div className="mx-auto max-w-5xl px-4 py-16 text-sm text-muted-foreground">Loading your reseller panel…</div>
        </div>
      );
    }
    return (
      <div className="admin-theme min-h-screen">
        <div className="mx-auto max-w-xl px-4 py-16">
          <Card className="bg-card/70">
            <CardHeader>
              <CardTitle>Panel is offline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                The server could not be reached and no saved snapshot exists on this device yet. Open the panel once
                while the server is online — after that Dev mode can run it offline.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={refresh}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Retry
                </Button>
                <Button size="sm" variant={devMode ? "default" : "outline"} onClick={toggleDev}>
                  <Wrench className="mr-1 h-4 w-4" /> Dev mode {devMode ? "on" : "off"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }


  if (!data.linked) {
    const copyText =
      data.status === "pending"
        ? "Your reseller application is still under review. We will email you as soon as it is approved."
        : data.status === "rejected"
          ? "Your reseller application was not approved. Contact support if you think this is a mistake."
          : "We could not find a reseller application for this email address.";
    return (
      <div className="admin-theme min-h-screen">
        <div className="mx-auto max-w-xl px-4 py-16">
          <Card className="bg-card/70">
            <CardHeader>
              <CardTitle>Reseller access not active yet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>{copyText}</p>
              <p>
                Signed in as <span className="text-foreground">{data.email || "—"}</span>. Make sure you use the same
                email address you applied with.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/reseller">Apply as reseller</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/account">Go to my account</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={refresh}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Re-check
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { reseller, stats } = data;

  const cards = [
    { label: "Remaining balance", value: priceTag(reseller.balance), icon: Wallet },
    { label: "My site order bill", value: priceTag(stats.siteBill), icon: ShoppingBag },
    { label: "Pending bill", value: priceTag(stats.pendingBill), icon: BarChart3 },
    { label: "Estimated profit", value: priceTag(stats.profit), icon: TrendingUp },
  ];


  return (
    <ResellerShell
      title="Reseller panel"
      subtitle={`${reseller.name} · ${data.email} · ${reseller.discount_percent}% reseller discount`}
      active={tab}
      onSelect={setTab}
      actions={
        <div className="flex flex-wrap items-center gap-2">
            {reseller.site_url ? (
              <Button asChild size="sm" variant="outline">
                <a href={reseller.site_url} target="_blank" rel="noreferrer">
                  <Globe className="mr-1 h-4 w-4" /> My site
                </a>
              </Button>
            ) : null}
            <Badge variant={reseller.is_active ? "secondary" : "destructive"}>
              {reseller.is_active ? "Active" : "Disabled"}
            </Badge>
            <Button size="sm" variant="outline" onClick={refresh}>
              <RefreshCw className="mr-1 h-4 w-4" /> Refresh
            </Button>
            <Button
              size="sm"
              variant={devMode ? "default" : "outline"}
              onClick={toggleDev}
              title="Dev mode: keeps the panel usable with the last saved data when server access is unavailable"
            >
              <Wrench className="mr-1 h-4 w-4" /> Dev mode {devMode ? "on" : "off"}
            </Button>
        </div>
      }
    >
      <div className="space-y-6">

        {offline ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-300">
            Offline / dev mode — showing the last saved snapshot from {cachedAt}. Writes (top-up, API key, settings)
            will fail until the server is reachable again.
          </div>
        ) : null}


        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="admin-panel rounded-2xl p-4 lg:p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm text-muted-foreground">{c.label}</p>
                <c.icon className="size-4 shrink-0 text-primary" />
              </div>
              <p className="mt-3 text-2xl font-extrabold tracking-tight tabular-nums lg:text-3xl">{c.value}</p>
            </div>
          ))}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ResellerTab)}>
          <TabsList className="hidden">
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="api">API key</TabsTrigger>
            <TabsTrigger value="balance">Balance</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="catalogue">Price list</TabsTrigger>
            <TabsTrigger value="site">My site</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-4">
            <Analytics stats={stats} />
          </TabsContent>

          <TabsContent value="api" className="mt-4">
            <ApiKeyPanel apiKey={reseller.api_key} allowWebsite={reseller.allow_website} allowBot={reseller.allow_bot} onRotated={refresh} />
          </TabsContent>

          <TabsContent value="balance" className="mt-4">
            <BalancePanel balance={reseller.balance} transactions={data.transactions} topups={data.topups} onDone={refresh} />
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <OrdersTable orders={data.orders} />
          </TabsContent>


          <TabsContent value="reports" className="mt-4">
            <ReportsPanel stats={stats} markup={reseller.markup_percent} />
          </TabsContent>

          <TabsContent value="catalogue" className="mt-4">
            <Catalogue />
          </TabsContent>

          <TabsContent value="site" className="mt-4">
            <SiteSettingsPanel reseller={reseller} onSaved={refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </ResellerShell>
  );
}

function Analytics({ stats }: { stats: Extract<Awaited<ReturnType<typeof getResellerPanel>>, { linked: true }>["stats"] }) {
  const segments = [
    { label: "Website sales", icon: Globe, ...stats.website },
    { label: "Telegram bot sales", icon: Bot, ...stats.bot },
    { label: "Other / direct API", icon: BarChart3, ...stats.other },
  ];
  const max = Math.max(1, ...stats.daily.map((d) => d.spent));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {segments.map((s) => (
          <Card key={s.label} className="bg-card/70">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="size-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-2xl font-extrabold tabular-nums">{s.orders}</p>
              <p className="text-muted-foreground">Expense {priceTag(s.spent)}</p>
              <p className="text-emerald-500">Profit {priceTag(s.profit)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="text-base">Last 30 active days</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet. Place your first API order to see analytics.</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {stats.daily.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date} · ${d.orders} orders · ${priceTag(d.spent)} spent · ${priceTag(d.profit)} profit`}
                  className="flex-1 rounded-t bg-primary/70 transition hover:bg-primary"
                  style={{ height: `${Math.max(4, (d.spent / max) * 100)}%` }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="My site orders" value={String(stats.siteOrders)} />
        <Stat label="My site order bill (cost)" value={priceTag(stats.siteBill)} />
        <Stat label="My site sale value (with markup)" value={priceTag(stats.siteRetail)} />
        <Stat label="Unpaid / pending bill" value={priceTag(stats.pendingBill)} />
        <Stat label="Remaining cash balance" value={priceTag(stats.balance)} />
        <Stat label="Completed orders" value={String(stats.completed)} />
        <Stat label="Pending orders" value={String(stats.pending)} />
        <Stat label="Retail value sold" value={priceTag(stats.retail)} />
      </div>

      <p className="text-xs text-muted-foreground">
        Profit is estimated as store retail price minus your reseller price. If you sell at a different price, your real
        profit will differ.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-panel rounded-2xl p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function fmtMinutes(m: number | null) {
  if (m == null) return "—";
  if (m < 1) return `${Math.round(m * 60)}s`;
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  return `${h}h ${rest}m`;
}

function monthLabel(month: string) {
  const [y, mo] = month.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return Number.isNaN(d.getTime()) ? month : d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function ReportsPanel({
  stats,
  markup,
}: {
  stats: Extract<Awaited<ReturnType<typeof getResellerPanel>>, { linked: true }>["stats"];
  markup: number;
}) {
  const rows = stats.monthly ?? [];
  const thisMonth = rows[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="This month sale" value={priceTag(thisMonth?.sale ?? 0)} />
        <Stat label="This month margin" value={`${priceTag(thisMonth?.margin ?? 0)} · ${thisMonth?.marginPercent ?? 0}%`} />
        <Stat label="Average delivery time / purchase" value={fmtMinutes(stats.avgFulfilMinutes ?? null)} />
      </div>

      <Card className="bg-card/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Monthly sales, margin & delivery time</CardTitle>
          <Timer className="size-4 text-primary" />
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No orders yet — the monthly report fills up automatically.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-3">Month</th>
                    <th className="px-4 py-3">Orders</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Sale ({markup}% markup)</th>
                    <th className="px-4 py-3">Margin</th>
                    <th className="px-4 py-3">Margin %</th>
                    <th className="px-4 py-3">Avg. delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.month} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3 font-medium">{monthLabel(m.month)}</td>
                      <td className="px-4 py-3 tabular-nums">{m.orders}</td>
                      <td className="px-4 py-3 tabular-nums">{priceTag(m.cost)}</td>
                      <td className="px-4 py-3 tabular-nums">{priceTag(m.sale)}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-500">{priceTag(m.margin)}</td>
                      <td className="px-4 py-3 tabular-nums">{m.marginPercent}%</td>
                      <td className="px-4 py-3 tabular-nums">{fmtMinutes(m.avgFulfilMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Sale value uses the markup saved in <b>My site</b>. Delivery time is measured from order creation to delivery.
      </p>
    </div>
  );
}


function ApiKeyPanel({
  apiKey,
  allowWebsite,
  allowBot,
  onRotated,
}: {
  apiKey: string;
  allowWebsite: boolean;
  allowBot: boolean;
  onRotated: () => void;
}) {
  const rotate = useServerFn(rotateMyApiKey);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const base = SITE_ORIGIN;

  return (
    <div className="space-y-4">
      <Card className="bg-card/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" /> Your API key
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant={allowWebsite ? "secondary" : "outline"}>Website {allowWebsite ? "on" : "off"}</Badge>
            <Badge variant={allowBot ? "secondary" : "outline"}>Bot {allowBot ? "on" : "off"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {shown ? apiKey : apiKey.slice(0, 8) + "•".repeat(24)}
            </code>
            <Button size="sm" variant="outline" onClick={() => setShown((s) => !s)}>
              {shown ? "Hide" : "Show"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(apiKey, "API key copied")}>
              <Copy className="mr-1 h-4 w-4" /> Copy
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Generate a new key? The old key stops working immediately.")) return;
                setBusy(true);
                try {
                  await rotate();
                  toast.success("New API key generated");
                  onRotated();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw className="mr-1 h-4 w-4" /> Regenerate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Keep this key on your server only — never inside browser or bot client code.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="text-base">Quick start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
{`curl "${base}/api/public/reseller/v1/products" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
          </pre>
          <Button asChild size="sm" variant="outline">
            <Link to="/reseller/docs">Open full API documentation</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function BalancePanel({
  balance,
  transactions,
  topups,
  onDone,
}: {
  balance: number;
  transactions: any[];
  topups: any[];
  onDone: () => void;
}) {
  const submit = useServerFn(requestTopUp);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bkash");
  const [txid, setTxid] = useState("");
  const [sender, setSender] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
    <AutoTopUp balance={balance} onDone={onDone} />
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="text-base">Add balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Current balance: <span className="font-semibold text-foreground">{priceTag(balance)}</span></p>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await submit({ data: { amount: Number(amount), method, txid, sender_info: sender } });
                toast.success("Top-up request sent. Admin will review it shortly.");
                setAmount("");
                setTxid("");
                setSender("");
                onDone();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="tu-amount">Amount</Label>
              <Input id="tu-amount" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tu-method">Payment method</Label>
              <Input id="tu-method" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="bKash / Nagad / USDT" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tu-txid">Transaction ID</Label>
              <Input id="tu-txid" value={txid} onChange={(e) => setTxid(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tu-sender">Sender number / note</Label>
              <Input id="tu-sender" value={sender} onChange={(e) => setSender(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Sending…" : "Send top-up request"}
            </Button>
          </form>

          {topups.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium">Your requests</p>
              {topups.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <span>{priceTag(Number(t.amount))} · {t.method}</span>
                  <Badge variant={t.status === "approved" ? "secondary" : t.status === "rejected" ? "destructive" : "outline"}>
                    {t.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="text-base">Wallet history</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wallet activity yet.</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{t.note || t.reference || t.type}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                  </div>
                  <span className={Number(t.amount) >= 0 ? "text-emerald-500" : "text-destructive"}>
                    {Number(t.amount) >= 0 ? "+" : ""}
                    {priceTag(Number(t.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

/** Automatic gateways — the same ones the Telegram bot uses. */
function AutoTopUp({ balance, onDone }: { balance: number; onDone: () => void }) {
  const start = useServerFn(startAutoTopUp);
  const check = useServerFn(checkAutoTopUp);
  const methods = useQuery({ queryKey: ["reseller-topup-methods"], queryFn: () => listTopupMethods() });
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [dep, setDep] = useState<any>(null);

  const list: any[] = (methods.data as any[]) ?? [];
  const active = method || list[0]?.id || "";

  if (!methods.isLoading && list.length === 0) return null;

  return (
    <Card className="bg-card/70">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Instant top-up (auto)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pay with the same gateways as our bot — your balance ({priceTag(balance)}) is credited automatically after the gateway confirms.
        </p>

        {!dep ? (
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const d = await start({ data: { method: active, amount: Number(amount) } });
                setDep(d);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="auto-method">Payment method</Label>
              <select
                id="auto-method"
                value={active}
                onChange={(e) => setMethod(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {list.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.note ? ` — ${m.note}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auto-amount">Amount (USD)</Label>
              <Input id="auto-amount" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Pay now"}</Button>
          </form>
        ) : (
          <div className="space-y-3 rounded-xl border border-border/60 p-4">
            <p className="text-sm font-medium">{dep.method}</p>
            {dep.pay_url ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Amount: <span className="font-semibold text-foreground">৳{Number(dep.bdt).toFixed(2)}</span> ({priceTag(Number(dep.amount_usdt))})
                </p>
                <Button asChild>
                  <a href={dep.pay_url} target="_blank" rel="noreferrer">Open payment page</a>
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{dep.kind === "payid" ? "Binance Pay ID" : `Send USDT on ${dep.network} only`}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-secondary px-2 py-1 text-xs">{dep.address}</code>
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(String(dep.address)); toast.success("Copied"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm">
                  Send exactly <span className="font-semibold">{Number(dep.amount_usdt).toFixed(4)} USDT</span> — the exact amount identifies your payment.
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r: any = await check({ data: { id: dep.id } });
                    if (r.ok) {
                      toast.success(r.message || "Balance credited");
                      setDep(null);
                      setAmount("");
                      onDone();
                    } else toast.info(r.message);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> I have paid — verify
              </Button>
              <Button variant="ghost" onClick={() => setDep(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OrdersTable({ orders }: { orders: any[] }) {
  if (orders.length === 0) {
    return <p className="text-sm text-muted-foreground">No API orders yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Order</th>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">Qty</th>
            <th className="px-3 py-2">Paid</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-border/50">
              <td className="px-3 py-2 font-mono text-xs">#{o.order_no}</td>
              <td className="px-3 py-2">{o.product_name}</td>
              <td className="px-3 py-2 tabular-nums">{o.quantity}</td>
              <td className="px-3 py-2 tabular-nums">{priceTag(Number(o.total))}</td>
              <td className="px-3 py-2">{o.source}</td>
              <td className="px-3 py-2">
                <Badge variant={o.status === "completed" ? "secondary" : "outline"}>{o.status}</Badge>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Catalogue() {
  const fetchCatalogue = useServerFn(getResellerCatalogue);
  const { data } = useQuery({ queryKey: ["reseller-catalogue"], queryFn: () => fetchCatalogue() });
  const rows: any[] = (data as any[]) ?? [];
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Loading price list…</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Retail</th>
            <th className="px-3 py-2">Your price</th>
            <th className="px-3 py-2">Stock</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border/50">
              <td className="px-3 py-2">{p.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.category}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground line-through">{priceTag(p.retail)}</td>
              <td className="px-3 py-2 font-semibold tabular-nums">{priceTag(p.your_price)}</td>
              <td className="px-3 py-2 tabular-nums">{p.stock === null ? "—" : p.stock}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reseller's own storefront settings + auto-generated install code. */
function SiteSettingsPanel({
  reseller,
  onSaved,
}: {
  reseller: Extract<Awaited<ReturnType<typeof getResellerPanel>>, { linked: true }>["reseller"];
  onSaved: () => void;
}) {
  const save = useServerFn(updateMySiteSettings);
  const saveHook = useServerFn(updateMyWebhook);
  const [hookUrl, setHookUrl] = useState(reseller.webhook_url);
  const [hookSecret, setHookSecret] = useState(reseller.webhook_secret);
  const [hookBusy, setHookBusy] = useState(false);
  const [siteUrl, setSiteUrl] = useState(reseller.site_url);
  const [siteName, setSiteName] = useState(reseller.site_name);
  const [botUsername, setBotUsername] = useState(reseller.bot_username);
  const [support, setSupport] = useState(reseller.support_contact);
  const [markup, setMarkup] = useState(String(reseller.markup_percent));
  const [busy, setBusy] = useState(false);

  const api = `${SITE_ORIGIN}/api/public/reseller/v1`;
  const origin = reseller.site_url || "https://your-domain.com";
  const env = `QORIX_API=${api}
QORIX_KEY=${reseller.api_key}
SITE_URL=${origin}
SITE_NAME=${reseller.site_name || reseller.name}
MARKUP=${(Number(reseller.markup_percent || 0) / 100 + 1).toFixed(2)}
PORT=3000${reseller.bot_username ? `\nBOT_USERNAME=${reseller.bot_username}` : ""}${
    reseller.support_contact ? `\nSUPPORT_CONTACT=${reseller.support_contact}` : ""
  }`;

  const install = `# 1) Download the starter kit and open the folder
cd reseller-site

# 2) Paste the .env content above into a .env file
nano .env

# 3) Start it
npm start        # website  -> ${origin}
npm run bot      # telegram bot${reseller.bot_username ? ` -> @${reseller.bot_username}` : ""}`;

  return (
    <div className="space-y-4">
      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-primary" /> My site settings
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rs-site">Website domain</Label>
            <Input id="rs-site" placeholder="mystore.com" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
            <p className="text-xs text-muted-foreground">All links, install code and documentation are generated with this domain.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-name">Store name</Label>
            <Input id="rs-name" placeholder="My Store" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-bot">Telegram bot username</Label>
            <Input id="rs-bot" placeholder="mystore_bot" value={botUsername} onChange={(e) => setBotUsername(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-support">Support contact</Label>
            <Input id="rs-support" placeholder="support@mystore.com" value={support} onChange={(e) => setSupport(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-markup">Default markup (%)</Label>
            <Input id="rs-markup" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await save({
                    data: {
                      site_url: siteUrl,
                      site_name: siteName,
                      bot_username: botUsername,
                      support_contact: support,
                      markup_percent: Number(markup || 0),
                    },
                  });
                  toast.success("Settings saved — all links updated");
                  onSaved();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to save");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save settings
            </Button>
            {reseller.site_url ? (
              <Button asChild size="sm" variant="outline">
                <a href={reseller.site_url} target="_blank" rel="noreferrer">
                  Open my site
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-primary" /> Live stock alerts (webhook)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Give us one https address and we send a message there the moment a product is restocked, runs low, sells
            out, changes price, is added or is switched off. No polling needed — your site and bot stay in sync in real
            time.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rs-hook">Notification URL</Label>
              <Input
                id="rs-hook"
                placeholder="https://mystore.com/api/qorix-stock"
                value={hookUrl}
                onChange={(e) => setHookUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rs-hook-secret">Signing secret</Label>
              <Input id="rs-hook-secret" readOnly value={hookSecret} placeholder="Saved after you add a URL" />
              <p className="text-xs text-muted-foreground">
                Every request carries <code>x-qorix-signature</code> — an HMAC-SHA256 of the body with this secret.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={hookBusy}
              onClick={async () => {
                setHookBusy(true);
                try {
                  const res = await saveHook({ data: { webhook_url: hookUrl } });
                  setHookUrl(res.webhook_url);
                  setHookSecret(res.webhook_secret);
                  toast.success(res.webhook_url ? "Live alerts enabled" : "Live alerts turned off");
                  onSaved();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to save");
                } finally {
                  setHookBusy(false);
                }
              }}
            >
              Save webhook
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={hookBusy || !hookUrl}
              onClick={async () => {
                setHookBusy(true);
                try {
                  const res = await saveHook({ data: { webhook_url: hookUrl, regenerate_secret: true } });
                  setHookSecret(res.webhook_secret);
                  toast.success("New secret generated");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to save");
                } finally {
                  setHookBusy(false);
                }
              }}
            >
              New secret
            </Button>
            {reseller.webhook_last_status ? (
              <span className="text-xs text-muted-foreground">
                Last delivery: {reseller.webhook_last_status}
                {reseller.webhook_last_at ? ` · ${new Date(reseller.webhook_last_at).toLocaleString()}` : ""}
              </span>
            ) : null}
          </div>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{`POST ${hookUrl || "https://mystore.com/api/qorix-stock"}
{
  "event": "restock" | "new" | "low" | "out" | "price" | "removed",
  "at": "2026-01-01T12:00:00.000Z",
  "product": { "id": "...", "name": "...", "price": 4.5, "stock": 12, "in_stock": true }
}`}</pre>
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Install code (.env)</CardTitle>
          <Button size="sm" variant="outline" onClick={() => copy(env, ".env copied")}>
            <Copy className="mr-1 h-4 w-4" /> Copy
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{env}</pre>
          <p className="text-xs text-muted-foreground">
            This code contains your API key — keep it on your own server only, never in the browser.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Setup commands</CardTitle>
          <Button size="sm" variant="outline" onClick={() => copy(install, "Commands copied")}>
            <Copy className="mr-1 h-4 w-4" /> Copy
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">{install}</pre>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/reseller/docs">Full documentation</Link>
            </Button>
            {reseller.bot_username ? (
              <Button asChild size="sm" variant="outline">
                <a href={`https://t.me/${reseller.bot_username}`} target="_blank" rel="noreferrer">
                  <Bot className="mr-1 h-4 w-4" /> Open my bot
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
