import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, CircleCheck, Clock3, Coins, Copy, CreditCard, FileText, Gem, Send, Store, Wallet, X, type LucideIcon } from "lucide-react";
import { getStorePayInfo, getWebsiteTopup, placeWebsiteTopup } from "@/lib/shop.functions";
import { Bubble, Key, KeyLink, Keys, Quote, Title } from "@/components/mobile/BotStorefront";
import { PaymentGatewayIcon } from "@/components/mobile/PaymentGatewayIcon";
import { priceTag } from "@/components/StoreShell";

type Hist = { id: string; type: string; amount: number; method: string | null; created_at: string };
type Gw = { id: string; icon: string; label: string; key: string; Icon: LucideIcon };
type Stage = { k: "home" } | { k: "history" } | { k: "amount"; gw: Gw } | { k: "pay"; gw: Gw; amount: number } | { k: "txid"; gw: Gw; amount: number } | { k: "result"; gw: Gw; amount: number; id: string; ok: boolean };

const GWS: Gw[] = [
  { id: "binance", icon: "payid", label: "Binance Pay (auto)", key: "binance_pay_id", Icon: CreditCard },
  { id: "bybit", icon: "bybit", label: "Bybit Pay", key: "bybit_uid", Icon: Wallet },
  { id: "chain_trc20", icon: "chain_trc20", label: "USDT · TRC20", key: "chain_trc20_address", Icon: Coins },
  { id: "chain_bep20", icon: "chain_bep20", label: "USDT · BEP20", key: "chain_bep20_address", Icon: Coins },
  { id: "usdt_trc20", icon: "usdt_trc20", label: "USDT · TRC20", key: "usdt_trc20_address", Icon: Coins },
  { id: "usdt_bep20", icon: "usdt_bep20", label: "USDT · BEP20", key: "usdt_bep20_address", Icon: Coins },
];

/** Email-only account wallet: own balance, top-up through the website's verified gateways, optional Telegram connect. */
export function WebsiteWallet({ web, onConnect }: { web: { balance: number; banned: boolean; history: Hist[] }; onConnect: () => void }) {
  const qc = useQueryClient();
  const fPay = useServerFn(getStorePayInfo), fTop = useServerFn(placeWebsiteTopup), fGet = useServerFn(getWebsiteTopup);
  const { data: pay } = useQuery({ queryKey: ["store-pay"], queryFn: () => fPay() });
  const p = (pay ?? {}) as Record<string, string>;
  const gws = GWS.filter((g) => {
    if (g.id === "binance") return p["enable_payid"] !== "0" && Boolean(p[g.key]);
    if (g.id.startsWith("usdt_")) return !p[g.key.replace("usdt_", "chain_")] && p["enable_crypto"] !== "0" && Boolean(p[g.key]);
    return Boolean(p[g.key]);
  });
  const [st, setSt] = useState<Stage>({ k: "home" });
  const [amount, setAmount] = useState("");
  const [txid, setTxid] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth", block: "end" }); setErr(""); }, [st]);
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copied"); };
  const anim = "flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300";
  const field = "w-full rounded-lg border border-tg-bubble-fg/15 bg-tg-bubble px-3 py-2 text-sm outline-none focus:border-tg-link";

  useQuery({
    queryKey: ["web-topup", st.k === "result" ? st.id : null], enabled: st.k === "result" && !st.ok, refetchInterval: 8000,
    queryFn: async () => {
      if (st.k !== "result") return null;
      const r = await fGet({ data: { id: st.id } });
      if (r.status === "credited") { setSt({ ...st, ok: true }); void qc.invalidateQueries({ queryKey: ["web-wallet"] }); }
      return r;
    },
  });

  async function submit(gw: Gw, amt: number) {
    setBusy(true); setErr("");
    try {
      const r = await fTop({ data: { amount: amt, payment_method: gw.id, txid } });
      setSt({ k: "result", gw, amount: amt, id: r.id, ok: r.credited });
      if (r.credited) void qc.invalidateQueries({ queryKey: ["web-wallet"] });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const back = (to: Stage) => <Key tone="red" icon={ChevronLeft} onClick={() => setSt(to)}>Back</Key>;
  const addr = (gw: Gw) => p[gw.key] ?? "";

  return (
    <div ref={ref} className="flex flex-col gap-1.5">
      {st.k === "home" ? (
        <div key="home" className={anim}>
          <Bubble className="w-full">
            <Title>WALLET</Title>
            <p className="mt-2 text-sm">Your website wallet:</p>
            <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />
            <p className="flex items-center gap-2 text-sm"><Wallet className="h-4 w-4 text-tg-link" /> Balance: <b>{priceTag(web.balance)}</b></p>
            <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />
            <p className="mt-2 text-sm italic">{web.banned ? "This wallet is unavailable." : "Choose a payment method below to add funds. You can also pay for products directly at checkout."}</p>
            <Quote><p>Optional: connect Telegram to use one wallet here and in the bot — your website balance moves into it automatically.</p></Quote>
          </Bubble>
          {!web.banned && gws.map((g) => <Key key={g.id} leading={<PaymentGatewayIcon gateway={g.icon} icon={g.Icon} />} onClick={() => { setAmount(""); setSt({ k: "amount", gw: g }); }}>{g.label}</Key>)}
          {!web.banned && gws.length === 0 && <Bubble><p className="text-sm">No payment method is available right now — please contact support.</p></Bubble>}
          <Key icon={FileText} onClick={() => setSt({ k: "history" })}>Transaction History</Key>
          <Key icon={Send} onClick={onConnect}>Connect Telegram (optional)</Key>
          <KeyLink tone="green" icon={Store} to="/">Home</KeyLink>
        </div>
      ) : st.k === "history" ? (
        <div key="hist" className={anim}>
          <Bubble className="w-full">
            <p className="font-bold">Transaction History</p>
            {web.history.length ? (
              <div className="mt-2 overflow-hidden rounded-md border border-tg-bubble-fg/15 text-sm">
                {web.history.map((t) => (
                  <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-tg-bubble-fg/10 px-2.5 py-1.5 last:border-0">
                    <span className="min-w-0 break-words capitalize">{t.type}{t.method ? ` · ${t.method}` : ""}<br /><span className="text-xs text-tg-muted">{new Date(t.created_at).toLocaleString()}</span></span>
                    <span className={`font-semibold ${t.amount >= 0 ? "text-tg-btn-green" : "text-tg-btn-red"}`}>{t.amount >= 0 ? "+" : "−"}{priceTag(Math.abs(t.amount))}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-1 text-sm">No transactions yet.</p>}
          </Bubble>
          {back({ k: "home" })}
        </div>
      ) : st.k === "amount" ? (
        <div key="amt" className={anim}>
          <Bubble className="w-full">
            <p className="flex items-center gap-2 font-bold"><PaymentGatewayIcon gateway={st.gw.icon} icon={st.gw.Icon} /> {st.gw.label}</p>
            <p className="mt-2 text-sm font-semibold">How much USDT do you want to add?</p>
            <Quote><p>Enter the amount only, e.g. <b>1</b> or <b>10.5</b>. You must send exactly this amount.</p><p className="mt-1">Each payment must be confirmed within <b>30 minutes</b>.</p></Quote>
            <input className={`${field} mt-2`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Amount in USD" />
          </Bubble>
          <Keys cols={3}>{[1, 5, 10, 20, 50, 100].map((v) => <Key key={v} active={amount === String(v)} onClick={() => setAmount(String(v))}>${v}</Key>)}</Keys>
          <Key tone="green" icon={CircleCheck} disabled={!(Number(amount) >= 1)} onClick={() => { setTxid(""); setSt({ k: "pay", gw: st.gw, amount: Math.round(Number(amount) * 100) / 100 }); }}>Continue</Key>
          {back({ k: "home" })}
        </div>
      ) : st.k === "pay" ? (
        <div key="pay" className={anim}>
          <Bubble className="w-full">
            <p className="flex items-start gap-2 text-sm"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-tg-btn-red" /> <span>Pay and submit the ID within 30 minutes.</span></p>
            <p className="mt-3 flex items-center gap-2 font-bold"><PaymentGatewayIcon gateway={st.gw.icon} icon={st.gw.Icon} /> {st.gw.label}</p>
            <p className="mt-2 text-sm">{st.gw.id === "binance" ? <>Open Binance app → <b>Pay</b> → <b>Send</b> → paste this Pay ID:</> : st.gw.id === "bybit" ? <>Bybit app → <b>Transfer</b> → internal transfer to this UID:</> : <>Send <b>USDT only</b> on this network to:</>}</p>
            <button type="button" onClick={() => copy(addr(st.gw))} className="block break-all text-left font-mono text-sm font-semibold text-tg-link">{addr(st.gw)}</button>
            <p className="mt-3 flex items-center gap-2 text-sm"><Coins className="h-4 w-4 text-tg-btn-green" /> Amount to send (tap to copy):</p>
            <button type="button" onClick={() => copy(st.amount.toFixed(2))} className="font-mono text-sm font-semibold text-tg-link">{st.amount.toFixed(2)}</button>
            <p className="mt-3 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 text-tg-btn-red" /> IMPORTANT — read before sending</p>
            <Quote><p>Send <b>exactly</b> this amount in USDT, then tap <b>I paid</b> and send the transaction / order ID — we confirm it automatically.</p></Quote>
          </Bubble>
          <Keys cols={2}>
            <Key icon={Copy} onClick={() => copy(addr(st.gw))}>{st.gw.id === "binance" ? "Copy ID" : "Copy address"}</Key>
            <Key icon={Coins} onClick={() => copy(st.amount.toFixed(2))}>Copy amount</Key>
          </Keys>
          <Key tone="green" icon={CircleCheck} onClick={() => setSt({ k: "txid", gw: st.gw, amount: st.amount })}>I paid → submit {st.gw.id === "binance" ? "Order ID" : "TXID"}</Key>
          <Key tone="red" icon={X} onClick={() => setSt({ k: "home" })}>Cancel</Key>
        </div>
      ) : st.k === "txid" ? (
        <div key="tx" className={anim}>
          <Bubble className="w-full">
            <p className="text-sm">Send the <b>{st.gw.id === "binance" ? "Binance Order ID" : st.gw.id === "bybit" ? "Bybit internal transfer ID" : "Transaction ID (TXID)"}</b> of your payment.</p>
            <p className="mt-2 text-sm">Your payment is confirmed only when this ID matches the receiving account history.</p>
            {err && <p className="mt-2 text-sm text-tg-btn-red">{err}</p>}
          </Bubble>
          <div className="flex items-center gap-2 rounded-2xl bg-tg-bubble p-1.5 shadow-sm">
            <input className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none" value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="Paste the ID here…" />
            <button type="button" aria-label="Send" disabled={busy || txid.trim().length < 4} onClick={() => submit(st.gw, st.amount)} className="grid h-10 w-10 place-items-center rounded-full bg-tg-btn text-tg-btn-fg disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </div>
          {busy && <Bubble><p className="text-sm">Verifying your payment. Please wait…</p></Bubble>}
          {back({ k: "pay", gw: st.gw, amount: st.amount })}
        </div>
      ) : (
        <div key="res" className={anim}>
          <Bubble className="w-full">
            <p className="flex items-center gap-2 text-sm">{st.ok ? <><Gem className="h-4 w-4 text-tg-btn-green" /> Payment verified — {priceTag(st.amount)} was added to your wallet.</> : "Payment received for checking. It has not been confirmed yet."}</p>
            {!st.ok && <p className="mt-2 text-sm italic">We keep checking automatically for up to 30 minutes — this page updates when it is confirmed.</p>}
          </Bubble>
          <Key tone={st.ok ? "green" : "blue"} icon={Wallet} onClick={() => { void qc.invalidateQueries({ queryKey: ["web-wallet"] }); setSt({ k: "home" }); }}>Wallet</Key>
        </div>
      )}
    </div>
  );
}
