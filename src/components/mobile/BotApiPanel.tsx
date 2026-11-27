import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, BadgeDollarSign, BellRing, BookOpen, CircleDot, Code2, Copy, IdCard, KeyRound, Link2, Package, Percent, RefreshCw, ShieldOff, Store, Wallet } from "lucide-react";
import { Bubble, Key, Keys } from "@/components/mobile/BotStorefront";
import { RESELLER_API_BASE } from "@/lib/bot/api-quick-guide";
import { getApiBanner, getWebApiOrders, getWebApiPanel, getWebApiPrices, webApiAction } from "@/lib/web-api-panel.functions";

const DOCS = "https://qorixlab.com/reseller/docs";
const money = (n: number) => `$${n.toFixed(2)}`;
type Sub = "panel" | "guide" | "key" | "prices" | "orders" | "alert" | "topup";

function Row({ cells }: { cells: [ReactNode, ReactNode][] }) {
  return (
    <div className={`grid ${cells.length === 1 ? "grid-cols-[auto_1fr]" : "grid-cols-[auto_1fr_auto_1fr]"} border-b border-tg-bubble-fg/15 last:border-0`}>
      {cells.map(([l, v], i) => (
        <div key={i} className="contents">
          <div className="flex items-center gap-1.5 border-r border-tg-bubble-fg/15 px-2 py-1.5">{l}</div>
          <div className={`px-2 py-1.5 ${i === 0 && cells.length > 1 ? "border-r border-tg-bubble-fg/15" : ""}`}>{v}</div>
        </div>
      ))}
    </div>
  );
}
const Pre = ({ children }: { children: string }) => <pre className="my-1.5 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-tg-bubble-fg/5 p-2 font-mono text-xs">{children}</pre>;
const DocsKey = () => <a href={DOCS} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn px-2 text-sm font-semibold text-tg-btn-fg shadow-sm active:scale-[0.98]"><BookOpen className="h-4 w-4" /> API Docs</a>;

/** Bot-identical Reseller API section for Mobile View; only API Docs leaves the page. */
export function BotApiPanel({ signedIn, onConnect, onHome, onWallet }: { signedIn: boolean; onConnect: () => void; onHome: () => void; onWallet: () => void }) {
  const qc = useQueryClient();
  const fBanner = useServerFn(getApiBanner), fPanel = useServerFn(getWebApiPanel), fAct = useServerFn(webApiAction);
  const fPrices = useServerFn(getWebApiPrices), fOrders = useServerFn(getWebApiOrders);
  const [sub, setSub] = useState<Sub>("panel");
  const [shownKey, setShownKey] = useState<{ key: string; fresh: boolean } | null>(null);
  const [alertAmt, setAlertAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: b } = useQuery({ queryKey: ["api-banner"], queryFn: () => fBanner() });
  const { data: panel, isPending } = useQuery({ queryKey: ["web-api-panel"], queryFn: () => fPanel(), enabled: signedIn });
  const { data: prices } = useQuery({ queryKey: ["web-api-prices"], queryFn: () => fPrices(), enabled: signedIn && sub === "prices" });
  const { data: orders } = useQuery({ queryKey: ["web-api-orders"], queryFn: () => fOrders(), enabled: signedIn && sub === "orders" });
  const a = panel?.account ?? null;
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copied"); };
  const back = <Key icon={Code2} onClick={() => setSub("panel")}>Reseller API</Key>;

  async function act(action: string, amount?: number) {
    setBusy(true);
    try {
      const r: any = await fAct({ data: amount === undefined ? { action } : { action, amount } });
      if (r.key) { setShownKey({ key: r.key, fresh: action === "regen" }); setSub("key"); }
      else setSub("panel");
      await qc.invalidateQueries({ queryKey: ["web-api-panel"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  if (sub === "guide") return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold"><Link2 className="h-4 w-4 text-tg-link" /> Quick start</p>
        <p>━━━━━━━━━━━━━━━━━━</p>
        <p>Three steps to your first call.</p>
        <p className="mt-2">1. Open your API account in this section and tap <b>Show Full Key</b> to copy your key. Keep it private.</p>
        <p className="mt-2">2. Send it on every request as a header:</p>
        <Pre>Authorization: Bearer &lt;your_api_key&gt;</Pre>
        <p>3. Try it — this returns your balance:</p>
        <Pre>{`curl -H "Authorization: Bearer <your_api_key>" \\\n  ${RESELLER_API_BASE}/me`}</Pre>
        <p className="font-bold">The calls you'll use most</p>
        <Pre>{["GET  /me — your balance & account", "GET  /products — browse & prices", "GET  /products/{id} — one product", "POST /orders — buy it", "GET  /orders — your orders", "GET  /orders/{id} — track an order", "GET  /transactions — wallet history"].map((l) => l.replace(" /", " /api/public/reseller/v1/")).join("\n")}</Pre>
        <p className="font-bold">Buying, in full</p>
        <Pre>{`curl -X POST ${RESELLER_API_BASE}/orders \\\n  -H "Authorization: Bearer <your_api_key>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"product_id": "<product_id>", "quantity": 1, "external_ref": "<your_unique_ref>"}'`}</Pre>
        <p>It's charged to your wallet balance and delivered in the reply — the same stock you'd get here.</p>
        <p className="mt-2">Send a unique <code>external_ref</code> on every order. If a connection drops and you retry with the same external_ref, you get the first result back instead of being charged twice.</p>
        <p className="mt-2">A key can spend your balance. Treat it like a password — never paste it anywhere public.</p>
      </Bubble>
      <a href={DOCS} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn px-2 text-sm font-semibold text-tg-btn-fg shadow-sm"><BookOpen className="h-4 w-4" /> Full documentation</a>
      {back}
    </>
  );

  if (sub === "key" && shownKey) return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold"><KeyRound className="h-4 w-4 text-tg-link" /> {shownKey.fresh ? "New API key generated" : "Your API key"}</p>
        <button type="button" onClick={() => copy(shownKey.key)} className="mt-2 block break-all text-left font-mono text-tg-link">{shownKey.key}</button>
        <p className="mt-2 italic">{shownKey.fresh ? "The old key stopped working right now." : "Keep it secret. Tap to copy."}</p>
      </Bubble>
      <Key icon={Copy} onClick={() => copy(shownKey.key)}>Copy key</Key>
      {back}
    </>
  );

  if (sub === "prices") return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold"><BadgeDollarSign className="h-4 w-4 text-tg-btn-green" /> M Y   P R I C E S</p>
        <p>──────────────</p>
        <p>{(prices?.discount ?? 0) > 0 ? <>Your discount: <b>{prices?.discount}%</b> off retail</> : "Custom pricing applies."}</p>
        <div className="mt-2 space-y-1">{!prices ? <p>Loading…</p> : prices.rows.length ? prices.rows.map((p, i) => <p key={i}>• <b>{p.name}</b><br /><span className="pl-3">retail {money(p.retail)} → <b>you pay {money(p.yours)}</b></span></p>) : <p>No products available right now.</p>}</div>
        <p className="mt-2 italic">Live prices and full catalogue come from the API.</p>
      </Bubble>
      {back}
      <Key tone="red" icon={Store} onClick={onHome}>Home</Key>
    </>
  );

  if (sub === "orders") return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold"><Package className="h-4 w-4 text-tg-link" /> A P I   O R D E R S</p>
        <p>──────────────</p>
        <div className="mt-1 space-y-1">{!orders ? <p>Loading…</p> : orders.length ? orders.map((o) => <p key={o.no}>• <code>#{o.no}</code> {o.name} ×{o.qty}<br /><span className="pl-3">{money(o.total)} · {o.status} · {new Date(o.at).toLocaleDateString()}</span></p>) : <p>No API orders yet.</p>}</div>
      </Bubble>
      {back}
      <Key tone="red" icon={Store} onClick={onHome}>Home</Key>
    </>
  );

  if (sub === "alert") return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold"><BellRing className="h-4 w-4 text-tg-link" /> Low balance alert</p>
        <p className="mt-2">Enter the amount that should trigger the alert, e.g. <code>2</code>. Send <code>0</code> to switch it off.</p>
        <input className="mt-2 w-full rounded-lg border border-tg-bubble-fg/15 bg-tg-bubble px-3 py-2 text-sm outline-none focus:border-tg-link" inputMode="decimal" value={alertAmt} onChange={(e) => setAlertAmt(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Amount in USD" />
      </Bubble>
      <Key tone="green" icon={BellRing} disabled={busy || alertAmt === ""} onClick={() => act("alert", Number(alertAmt))}>Save</Key>
      {back}
    </>
  );

  if (sub === "topup" && a) return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold"><Wallet className="h-4 w-4 text-tg-link" /> One balance</p>
        <p className="mt-2">Your bot wallet and API balance are the same: <b>{money(a.balance)}</b>.<br />Top up from Wallet — it works for both bot and API orders.</p>
      </Bubble>
      <Key icon={Wallet} onClick={onWallet}>Wallet</Key>
      {back}
    </>
  );

  const banner = b?.banner ? <img src={b.banner} alt="Reseller API" className="-mx-3 -mt-2 mb-2 block w-[calc(100%+1.5rem)] max-w-none rounded-t-2xl object-cover" /> : null;

  if (signedIn && isPending) return <Bubble><p className="text-sm">Loading…</p></Bubble>;

  if (!a) return (
    <>
      <Bubble className="w-full text-sm">
        {banner}
        <p className="flex items-center gap-2 font-bold"><Code2 className="h-4 w-4 text-tg-link" /> R E S E L L E R   A P I</p>
        <p>──────────────</p>
        <p>Sell our whole catalogue from <b>your own website or bot</b>.</p>
        <p className="mt-2 flex items-center gap-2"><Wallet className="h-4 w-4 shrink-0 text-tg-link" /> Your API balance pays the wholesale price</p>
        <p className="flex items-center gap-2"><Package className="h-4 w-4 shrink-0 text-tg-link" /> Orders are delivered through the API (manual products are fulfilled by our team)</p>
        <p className="flex items-center gap-2"><KeyRound className="h-4 w-4 shrink-0 text-tg-link" /> You get a private API key in one tap</p>
        <p className="mt-2 italic">Open your free API account below.</p>
      </Bubble>
      <Key icon={KeyRound} disabled={busy} onClick={() => (signedIn && panel?.canCreate ? act("create") : onConnect())}>Create API Account</Key>
      <DocsKey />
      <Key icon={Link2} onClick={() => setSub("guide")}>Quick start guide</Key>
      <Key tone="red" icon={ArrowLeft} onClick={onHome}>Home</Key>
    </>
  );

  return (
    <>
      <Bubble className="w-full text-sm">
        {banner}
        <div className="overflow-hidden rounded-md border border-tg-bubble-fg/15">
          <div className="flex items-center justify-center gap-2 border-b border-tg-bubble-fg/15 bg-tg-bubble-fg/5 py-1.5 font-bold"><Code2 className="h-4 w-4 text-tg-link" /> RESELLER API</div>
          <Row cells={[[<><IdCard className="h-4 w-4 text-tg-link" /> Account</>, <span><b>{a.name}</b><br /><code className="text-tg-link">#{a.no ?? "—"}</code></span>], [<><CircleDot className={`h-4 w-4 ${a.active ? "text-tg-btn-green" : "text-tg-btn-red"}`} /> Status</>, <b>{a.active ? "Active" : "Revoked"}</b>]]} />
          <Row cells={[[<><Wallet className="h-4 w-4 text-tg-link" /> API Balance</>, <b>{money(a.balance)}</b>], [<><Percent className="h-4 w-4 text-tg-link" /> Discount</>, a.discount > 0 ? <span><b>{a.discount}%</b> off retail</span> : "custom pricing"]]} />
          <Row cells={[[<><Package className="h-4 w-4 text-tg-link" /> API Orders</>, <span><b>{a.orders}</b> ({money(a.spent)} total)</span>]]} />
          <Row cells={[[<><KeyRound className="h-4 w-4 text-tg-link" /> API Key</>, <code className="text-tg-link">{a.keyMasked}</code>], [<><BellRing className="h-4 w-4 text-tg-link" /> Low-Bal Alert</>, a.alert > 0 ? <b>{money(a.alert)}</b> : "off"]]} />
        </div>
        <p className="mt-2 italic">One balance for everything: bot orders and API orders use the same wallet. Manage your API account below.</p>
      </Bubble>
      <Key icon={Wallet} onClick={() => setSub("topup")}>Top Up Balance</Key>
      <Keys cols={2}>
        <Key icon={BadgeDollarSign} onClick={() => setSub("prices")}>My Prices</Key>
        <Key icon={Package} onClick={() => setSub("orders")}>API Orders</Key>
      </Keys>
      <DocsKey />
      <Key icon={Link2} onClick={() => setSub("guide")}>Quick start guide</Key>
      <Keys cols={2}>
        <Key icon={RefreshCw} disabled={busy} onClick={() => { if (confirm("Generate a new key? The old key stops working immediately.")) void act("regen"); }}>Regenerate Key</Key>
        <Key icon={ShieldOff} disabled={busy} onClick={() => void act("revoke")}>{a.active ? "Revoke Key" : "Re-activate Key"}</Key>
      </Keys>
      <Key icon={BellRing} onClick={() => { setAlertAmt(""); setSub("alert"); }}>{`Low Balance Alert (${a.alert > 0 ? money(a.alert) : "off"})`}</Key>
      <Key icon={KeyRound} disabled={busy} onClick={() => void act("key")}>Show Full Key</Key>
      <Key tone="red" icon={ArrowLeft} onClick={onHome}>Home</Key>
    </>
  );
}
