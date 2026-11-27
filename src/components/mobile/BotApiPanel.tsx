import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, BadgeDollarSign, BellRing, BookOpen, CircleDot, Code2, Copy, IdCard, KeyRound, Package, Percent, RefreshCw, ShieldOff, Store, Wallet } from "lucide-react";
import { Bubble, Key, Keys } from "@/components/mobile/BotStorefront";
import { ApiPanelIcon } from "@/components/mobile/ApiPanelIcon";
import { ButtonPremiumIcon } from "@/components/mobile/ButtonPremiumIcon";
import { RESELLER_API_BASE } from "@/lib/bot/api-quick-guide";
import { API_PLAIN_GLYPHS, type ApiIconKey } from "@/lib/bot/api-icons";
import { getApiBanner, getApiPanelIcons, getWebApiOrders, getWebApiPanel, getWebApiPrices, webApiAction } from "@/lib/web-api-panel.functions";

const DOCS = "https://qorixlab.com/reseller/docs";
const money = (n: number) => `$${n.toFixed(2)}`;
type Sub = "panel" | "guide" | "key" | "prices" | "orders" | "alert" | "topup";

/** The glyph the bot types straight into a button, with no admin icon setting behind it. */
const PlainGlyph = ({ glyph }: { glyph: string }) => (
  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none">{glyph}</span>
);

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

/** Bot-identical Reseller API section for Mobile View; only API Docs leaves the page. */
export function BotApiPanel({ signedIn, onConnect, onHome, onWallet }: { signedIn: boolean; onConnect: () => void; onHome: () => void; onWallet: () => void }) {
  const qc = useQueryClient();
  const fBanner = useServerFn(getApiBanner), fPanel = useServerFn(getWebApiPanel), fAct = useServerFn(webApiAction);
  const fPrices = useServerFn(getWebApiPrices), fOrders = useServerFn(getWebApiOrders), fIcons = useServerFn(getApiPanelIcons);
  const [sub, setSub] = useState<Sub>("panel");
  const [shownKey, setShownKey] = useState<{ key: string; fresh: boolean } | null>(null);
  const [alertAmt, setAlertAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: b } = useQuery({ queryKey: ["api-banner"], queryFn: () => fBanner() });
  const { data: icons } = useQuery({ queryKey: ["api-panel-icons"], queryFn: () => fIcons() });
  const { data: panel, isPending } = useQuery({ queryKey: ["web-api-panel"], queryFn: () => fPanel(), enabled: signedIn });
  const { data: prices } = useQuery({ queryKey: ["web-api-prices"], queryFn: () => fPrices(), enabled: signedIn && sub === "prices" });
  const { data: orders } = useQuery({ queryKey: ["web-api-orders"], queryFn: () => fOrders(), enabled: signedIn && sub === "orders" });
  const a = panel?.account ?? null;
  /** Exact bot artwork for one API icon: Premium emoji media when the bot has one, else its glyph. */
  const ic = (key: ApiIconKey, fallback: LucideIcon) => <ApiPanelIcon icon={icons?.[key]} fallback={fallback} />;
  const home = <ButtonPremiumIcon setting="ui_icon_com_home" fallback={ArrowLeft} />;
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copied"); };
  const back = <Key leading={ic("panel", Code2)} onClick={() => setSub("panel")}>Reseller API</Key>;
  const docs = <Key leading={ic("docs", BookOpen)} onClick={() => window.open(DOCS, "_blank", "noreferrer")}>API Docs</Key>;
  const guide = <Key leading={<PlainGlyph glyph={API_PLAIN_GLYPHS.guide} />} onClick={() => setSub("guide")}>Quick start guide</Key>;

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
        <p className="flex items-center gap-2 font-bold"><PlainGlyph glyph={API_PLAIN_GLYPHS.guide} /> Quick start</p>
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
      <Key leading={ic("docs", BookOpen)} onClick={() => window.open(DOCS, "_blank", "noreferrer")}>Full documentation</Key>
      {back}
    </>
  );

  if (sub === "key" && shownKey) return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold">{ic("key", KeyRound)} {shownKey.fresh ? "New API key generated" : "Your API key"}</p>
        <button type="button" onClick={() => copy(shownKey.key)} className="mt-2 block break-all text-left font-mono text-tg-link">{shownKey.key}</button>
        <p className="mt-2 italic">{shownKey.fresh ? "The old key stopped working right now." : "Keep it secret. Tap to copy."}</p>
      </Bubble>
      <Key leading={ic("key", Copy)} onClick={() => copy(shownKey.key)}>Copy key</Key>
      {back}
    </>
  );

  if (sub === "prices") return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold">{ic("prices", BadgeDollarSign)} M Y   P R I C E S</p>
        <p>──────────────</p>
        <p>{(prices?.discount ?? 0) > 0 ? <>Your discount: <b>{prices?.discount}%</b> off retail</> : "Custom pricing applies."}</p>
        <div className="mt-2 space-y-1">{!prices ? <p>Loading…</p> : prices.rows.length ? prices.rows.map((p, i) => <p key={i}>• <b>{p.name}</b><br /><span className="pl-3">retail {money(p.retail)} → <b>you pay {money(p.yours)}</b></span></p>) : <p>No products available right now.</p>}</div>
        <p className="mt-2 italic">Live prices and full catalogue come from the API.</p>
      </Bubble>
      {back}
      <Key tone="red" leading={home} onClick={onHome}>Home</Key>
    </>
  );

  if (sub === "orders") return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold">{ic("orders", Package)} A P I   O R D E R S</p>
        <p>──────────────</p>
        <div className="mt-1 space-y-1">{!orders ? <p>Loading…</p> : orders.length ? orders.map((o) => <p key={o.no}>• <code>#{o.no}</code> {o.name} ×{o.qty}<br /><span className="pl-3">{money(o.total)} · {o.status} · {new Date(o.at).toLocaleDateString()}</span></p>) : <p>No API orders yet.</p>}</div>
      </Bubble>
      {back}
      <Key tone="red" leading={home} onClick={onHome}>Home</Key>
    </>
  );

  if (sub === "alert") return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold">{ic("alert", BellRing)} Low balance alert</p>
        <p className="mt-2">Enter the amount that should trigger the alert, e.g. <code>2</code>. Send <code>0</code> to switch it off.</p>
        <input className="mt-2 w-full rounded-lg border border-tg-bubble-fg/15 bg-tg-bubble px-3 py-2 text-sm outline-none focus:border-tg-link" inputMode="decimal" value={alertAmt} onChange={(e) => setAlertAmt(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Amount in USD" />
      </Bubble>
      <Key tone="green" leading={ic("alert", BellRing)} disabled={busy || alertAmt === ""} onClick={() => act("alert", Number(alertAmt))}>Save</Key>
      {back}
    </>
  );

  if (sub === "topup" && a) return (
    <>
      <Bubble className="w-full text-sm">
        <p className="flex items-center gap-2 font-bold">{ic("topup", Wallet)} One balance</p>
        <p className="mt-2">Your bot wallet and API balance are the same: <b>{money(a.balance)}</b>.<br />Top up from Wallet — it works for both bot and API orders.</p>
      </Bubble>
      <Key leading={ic("topup", Wallet)} onClick={onWallet}>Wallet</Key>
      {back}
    </>
  );

  const banner = b?.banner ? <img src={b.banner} alt="Reseller API" className="-mx-3 -mt-2 mb-2 block w-[calc(100%+1.5rem)] max-w-none rounded-t-2xl object-cover" /> : null;

  if (signedIn && isPending) return <Bubble><p className="text-sm">Loading…</p></Bubble>;

  if (!a) return (
    <>
      <Bubble className="w-full text-sm">
        {banner}
        <p className="flex items-center gap-2 font-bold">{ic("panel", Code2)} R E S E L L E R   A P I</p>
        <p>──────────────</p>
        <p>Sell our whole catalogue from <b>your own website or bot</b>.</p>
        <p className="mt-2 flex items-center gap-2">{ic("balance", Wallet)} Your API balance pays the wholesale price</p>
        <p className="flex items-center gap-2">{ic("orders", Package)} Orders are delivered through the API (manual products are fulfilled by our team)</p>
        <p className="flex items-center gap-2">{ic("key", KeyRound)} You get a private API key in one tap</p>
        <p className="mt-2 italic">Open your free API account below.</p>
      </Bubble>
      <Key leading={ic("key", KeyRound)} disabled={busy} onClick={() => (signedIn && panel?.canCreate ? act("create") : onConnect())}>Create API Account</Key>
      {docs}
      {guide}
      <Key tone="red" leading={home} onClick={onHome}>Home</Key>
    </>
  );

  return (
    <>
      <Bubble className="w-full text-sm">
        {banner}
        <div className="overflow-hidden rounded-md border border-tg-bubble-fg/15">
          <div className="flex items-center justify-center gap-2 border-b border-tg-bubble-fg/15 bg-tg-bubble-fg/5 py-1.5 font-bold">{ic("panel", Code2)} RESELLER API</div>
          <Row cells={[[<>{ic("account", IdCard)} Account</>, <span><b>{a.name}</b><br /><code className="text-tg-link">#{a.no ?? "—"}</code></span>], [<>{ic("status", CircleDot)} Status</>, <b>{a.active ? "Active" : "Revoked"}</b>]]} />
          <Row cells={[[<>{ic("balance", Wallet)} API Balance</>, <b>{money(a.balance)}</b>], [<>{ic("discount", Percent)} Discount</>, a.discount > 0 ? <span><b>{a.discount}%</b> off retail</span> : "custom pricing"]]} />
          <Row cells={[[<>{ic("orders", Package)} API Orders</>, <span><b>{a.orders}</b> ({money(a.spent)} total)</span>]]} />
          <Row cells={[[<>{ic("key", KeyRound)} API Key</>, <code className="text-tg-link">{a.keyMasked}</code>], [<>{ic("alert", BellRing)} Low-Bal Alert</>, a.alert > 0 ? <b>{money(a.alert)}</b> : "off"]]} />
        </div>
        <p className="mt-2 italic">One balance for everything: bot orders and API orders use the same wallet. Manage your API account below.</p>
      </Bubble>
      <Key leading={ic("topup", Wallet)} onClick={() => setSub("topup")}>Top Up Balance</Key>
      <Keys cols={2}>
        <Key leading={ic("prices", BadgeDollarSign)} onClick={() => setSub("prices")}>My Prices</Key>
        <Key leading={ic("orders", Package)} onClick={() => setSub("orders")}>API Orders</Key>
      </Keys>
      {docs}
      {guide}
      <Keys cols={2}>
        <Key leading={ic("regen", RefreshCw)} disabled={busy} onClick={() => { if (confirm("Generate a new key? The old key stops working immediately.")) void act("regen"); }}>Regenerate Key</Key>
        <Key leading={ic("revoke", ShieldOff)} disabled={busy} onClick={() => void act("revoke")}>{a.active ? "Revoke Key" : "Re-activate Key"}</Key>
      </Keys>
      <Key leading={ic("alert", BellRing)} onClick={() => { setAlertAmt(""); setSub("alert"); }}>{`Low Balance Alert (${a.alert > 0 ? money(a.alert) : "off"})`}</Key>
      <Key leading={ic("key", KeyRound)} disabled={busy} onClick={() => void act("key")}>Show Full Key</Key>
      <Key tone="red" leading={home} onClick={onHome}>Home</Key>
    </>
  );
}
