import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createWebLinkCode, getWebDeposit, getWebProfile, getWebWallet, startWebDeposit, submitWebDepositTxid } from "@/lib/web-wallet.functions";
import { getStorePayInfo } from "@/lib/shop.functions";
import { getEpsStatus } from "@/lib/eps.functions";
import { getOxapayStatus } from "@/lib/oxapay.functions";
import { AlertTriangle, Medal, QrCode, RotateCcw, Send, X } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { BotDelivery } from "@/components/mobile/BotDelivery";
import type { LucideIcon } from "lucide-react";
import { Bitcoin, Coins, FileText, Gem, Landmark, Ticket, CalendarDays, ChevronDown, ChevronLeft, CircleCheck, Clock3, Copy, CreditCard, Gift, Package, Store, User, Wallet, Zap, Info } from "lucide-react";
import { BotFrame } from "@/components/mobile/BotFrame";
import { Bubble, Key, KeyLink, Keys, Quote, Title } from "@/components/mobile/BotStorefront";
import { priceTag } from "@/components/StoreShell";

const anim = "flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300";
const statusCls = (s: string) => (s === "completed" ? "text-tg-btn-green" : s === "cancelled" || s === "refunded" || s === "failed" ? "text-tg-btn-red" : "text-tg-link");
const Cmd = ({ children }: { children: ReactNode }) => <div className="mb-1 self-end rounded-2xl rounded-br-md bg-tg-header px-3 py-1.5 text-sm text-tg-link shadow-sm">{children}</div>;

function Table({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-tg-bubble-fg/15 text-sm">
      {rows.map(([a, b], i) => (
        <div key={i} className="grid grid-cols-[auto_1fr] border-b border-tg-bubble-fg/10 last:border-0">
          <div className="flex items-center gap-2 bg-tg-bubble-fg/5 px-2.5 py-1.5">{a}</div>
          <div className="px-2.5 py-1.5 text-right font-semibold">{b}</div>
        </div>
      ))}
    </div>
  );
}

type Gw = { id: string; label: string; icon: LucideIcon; link?: boolean };
type Dep = { id: string; kind: string; network: string | null; address: string; amount_usdt: number; expires_at: string; qr: string };
type Stage = { k: "home" } | { k: "amount"; gw: Gw } | { k: "pay"; gw: Gw; dep: Dep } | { k: "txid"; gw: Gw; dep: Dep } | { k: "result"; gw: Gw; dep: Dep; msg: string; ok: boolean } | { k: "history" };

/** Deposit page = the bot WALLET flow, using the connected bot wallet and the bot's own deposit verification. */
export function BotWallet() {
  const qc = useQueryClient();
  const fWallet = useServerFn(getWebWallet), fCode = useServerFn(createWebLinkCode), fStart = useServerFn(startWebDeposit);
  const fTx = useServerFn(submitWebDepositTxid), fDep = useServerFn(getWebDeposit), fPay = useServerFn(getStorePayInfo);
  const fEps = useServerFn(getEpsStatus), fOxa = useServerFn(getOxapayStatus);
  const { data: w, refetch } = useQuery({ queryKey: ["web-wallet"], queryFn: () => fWallet() });
  const { data: pay } = useQuery({ queryKey: ["store-pay"], queryFn: () => fPay() });
  const { data: eps } = useQuery({ queryKey: ["eps-status"], queryFn: () => fEps() });
  const { data: oxa } = useQuery({ queryKey: ["oxapay-status"], queryFn: () => fOxa() });
  const [st, setSt] = useState<Stage>({ k: "home" });
  const [amount, setAmount] = useState("");
  const [txid, setTxid] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); setErr(""); }, [st]);

  const p = (pay ?? {}) as Record<string, string>;
  const gws: Gw[] = [
    ...(p["enable_payid"] !== "0" ? [{ id: "payid", label: "Binance Pay (auto)", icon: CreditCard }] : []),
    ...(p["bybit_uid"] ? [{ id: "bybit", label: "Bybit Pay", icon: Wallet }] : []),
    ...(p["chain_trc20_address"] ? [{ id: "chain_trc20", label: "USDT · TRC20", icon: Coins }] : []),
    ...(p["chain_bep20_address"] ? [{ id: "chain_bep20", label: "USDT · BEP20", icon: Coins }] : []),
    ...(!p["chain_trc20_address"] && p["enable_crypto"] !== "0" ? [{ id: "usdt_trc20", label: "USDT · TRC20", icon: Coins }] : []),
    ...(!p["chain_bep20_address"] && p["enable_crypto"] !== "0" ? [{ id: "usdt_bep20", label: "USDT · BEP20", icon: Coins }] : []),
    ...((eps as any)?.enabled ? [{ id: "eps_mfs", label: "bKash · Nagad · Rocket & more (auto)", icon: Landmark, link: true }, { id: "eps_card", label: "Visa · Mastercard (auto)", icon: CreditCard, link: true }] : []),
    ...((oxa as any)?.enabled ? [{ id: "oxapay", label: "Any Crypto · BTC, LTC, USDT", icon: Bitcoin, link: true }] : []),
  ];
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copied"); };
  const btn = "flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold text-tg-btn-fg shadow-sm transition active:scale-[0.98] disabled:opacity-50";
  const botUser = w?.botUser ?? "";

  // Poll the open deposit so the page shows the credit as soon as the bot verifies it.
  const openDep = st.k === "pay" || st.k === "txid" || st.k === "result" ? st.dep : null;
  useQuery({
    queryKey: ["web-dep", openDep?.id], enabled: Boolean(openDep) && !(st.k === "result" && st.ok),
    refetchInterval: 8000,
    queryFn: async () => {
      const r = await fDep({ data: { id: openDep!.id } });
      if (r.status === "credited" && st.k !== "home" && "gw" in st && "dep" in st) {
        setSt({ k: "result", gw: st.gw, dep: st.dep, ok: true, msg: "Payment verified — the amount was added to your wallet." });
        void qc.invalidateQueries({ queryKey: ["web-wallet"] });
      }
      return r;
    },
  });

  async function connect() {
    if (!botUser) { toast.error("Bot is not configured yet."); return; }
    const tab = window.open("about:blank", "_blank");
    try { const { code } = await fCode(); const url = `https://t.me/${botUser}?start=wl_${code}`; if (tab) tab.location.href = url; else window.location.href = url; }
    catch (e) { tab?.close(); toast.error((e as Error).message); }
  }
  async function start(gw: Gw) {
    setBusy(true); setErr("");
    try {
      const r: any = await fStart({ data: { gw: gw.id, amount: Number(amount) } });
      if (r.error) { setErr(r.error); return; }
      if (gw.link) { window.location.href = r.row.address; return; }
      setTxid(""); setSt({ k: "pay", gw, dep: r.row });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function sendTx(gw: Gw, dep: Dep) {
    setBusy(true);
    try { const r = await fTx({ data: { id: dep.id, txid } }); setSt({ k: "result", gw, dep, msg: r.message, ok: r.credited }); if (r.credited) void qc.invalidateQueries({ queryKey: ["web-wallet"] }); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const field = "w-full rounded-lg border border-tg-bubble-fg/15 bg-tg-bubble px-3 py-2 text-sm outline-none focus:border-tg-link";
  const back = (to: Stage) => <Key tone="red" icon={ChevronLeft} onClick={() => setSt(to)}>Back</Key>;
  const isPayId = (d: Dep) => d.kind === "payid";

  return (
    <BotFrame scrollRef={scrollRef}>
      <Cmd>Deposit</Cmd>
      {!w ? <Bubble><p className="text-sm">Loading…</p></Bubble> : !w.linked ? (
        <div className={anim}>
          <Bubble className="w-full">
            <Title>WALLET</Title>
            <p className="mt-2 text-sm">Connect your Telegram account to use the <b>same wallet</b> here and in the bot.</p>
            <Quote><p>Tap <b>Connect Telegram</b>, press <b>Start</b> in the bot, then come back and tap <b>Refresh</b>. The link works once and expires in 10 minutes.</p></Quote>
          </Bubble>
          <button type="button" onClick={connect} className={`${btn} bg-tg-btn-green`}><Send className="h-4 w-4" /> Connect Telegram</button>
          <Key icon={RotateCcw} onClick={() => void refetch()}>Refresh</Key>
          <KeyLink tone="green" icon={Store} to="/">Home</KeyLink>
        </div>
      ) : st.k === "home" ? (
        <div key="home" className={anim}>
          <Bubble className="w-full">
            <Title>WALLET</Title>
            <p className="mt-2 text-sm">Your Balance and Spending Stats are:</p>
            <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />
            <p className="flex items-center gap-2 text-sm"><Wallet className="h-4 w-4 text-tg-link" /> Balance: <b>{priceTag(w.balance)}</b></p>
            <p className="flex items-center gap-2 text-sm"><Gem className="h-4 w-4 text-tg-link" /> Total Spent: {priceTag(w.total_spent)}</p>
            <p className="flex items-center gap-2 text-sm"><Medal className="h-4 w-4 text-tg-btn-red" /> Membership: {w.membership}</p>
            <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />
            <p className="mt-2 text-sm italic">Choose a payment method below to add funds to your wallet.</p>
          </Bubble>
          {gws.map((g) => <Key key={g.id} icon={g.icon} onClick={() => { setAmount(""); setSt({ k: "amount", gw: g }); }}>{g.label}</Key>)}
          {botUser ? <a href={`https://t.me/${botUser}`} target="_blank" rel="noreferrer" className={`${btn} bg-tg-btn`}><Ticket className="h-4 w-4" /> Redeem Code</a> : null}
          <Key icon={FileText} onClick={() => setSt({ k: "history" })}>Transaction History</Key>
          <KeyLink tone="green" icon={Store} to="/">Home</KeyLink>
        </div>
      ) : st.k === "history" ? (
        <div key="hist" className={anim}>
          <Bubble className="w-full">
            <p className="font-bold">Transaction History</p>
            {w.history.length ? <Table rows={w.history.map((t) => [<span className="capitalize">{t.type}{t.method ? ` · ${t.method}` : ""}<br /><span className="text-xs text-tg-muted">{new Date(t.created_at).toLocaleString()}</span></span>, <span className={t.amount >= 0 ? "text-tg-btn-green" : "text-tg-btn-red"}>{t.amount >= 0 ? "+" : "−"}{priceTag(Math.abs(t.amount))}<br /><span className="text-xs uppercase text-tg-muted">{t.status}</span></span>])} />
              : <p className="mt-1 text-sm">No transactions yet.</p>}
          </Bubble>
          {back({ k: "home" })}
        </div>
      ) : st.k === "amount" ? (
        <div key="amt" className={anim}>
          <Bubble className="w-full">
            <p className="flex items-center gap-2 font-bold"><st.gw.icon className="h-4 w-4 text-tg-link" /> {st.gw.label}</p>
            <p className="mt-2 text-sm font-semibold">How much USDT do you want to add?</p>
            <Quote>
              <p>Enter the amount only, e.g. <b>1</b> or <b>10.5</b>.</p>
              {!st.gw.link && <p className="mt-1">Next you'll get the <b>exact amount</b> to send — pay that amount precisely.</p>}
              <p className="mt-1">Each deposit stays open for <b>30 minutes</b>.</p>
            </Quote>
            <input className={`${field} mt-2`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Amount in USD" />
            {err && <p className="mt-2 text-sm text-tg-btn-red">{err}</p>}
          </Bubble>
          <Keys cols={3}>{[1, 5, 10, 20, 50, 100].map((v) => <Key key={v} active={amount === String(v)} onClick={() => setAmount(String(v))}>${v}</Key>)}</Keys>
          <Key tone="green" icon={CircleCheck} disabled={busy || !(Number(amount) > 0)} onClick={() => start(st.gw)}>{busy ? "Please wait…" : st.gw.link ? "Pay now" : "Continue"}</Key>
          {back({ k: "home" })}
        </div>
      ) : st.k === "pay" ? (
        <div key="pay" className={anim}>
          <Bubble className="w-full">
            <p className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-tg-link" /> <b>Deposit ID:</b> <span className="font-mono text-tg-link">{st.dep.id.slice(0, 8)}</span></p>
            <p className="mt-1 flex items-start gap-2 text-sm"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-tg-btn-red" /> <span>Open until {new Date(st.dep.expires_at).toLocaleTimeString()} (30 minutes). Unpaid deposits expire automatically.</span></p>
            <p className="mt-3 flex items-center gap-2 font-bold"><st.gw.icon className="h-4 w-4 text-tg-link" /> {st.gw.label}</p>
            <p className="mt-2 text-sm">{isPayId(st.dep) ? <>Open Binance app → <b>Pay</b> → <b>Send</b> → paste this Pay ID:</> : st.dep.kind === "bybit" ? <>Bybit app → <b>Transfer</b> → internal transfer to this UID:</> : <>Send <b>USDT only</b> on the {st.gw.label.split("·")[1]?.trim()} network to:</>}</p>
            <button type="button" onClick={() => copy(st.dep.address)} className="block break-all text-left font-mono text-sm font-semibold text-tg-link">{st.dep.address}</button>
            <p className="mt-3 flex items-center gap-2 text-sm"><Coins className="h-4 w-4 text-tg-btn-green" /> Amount to send (tap to copy):</p>
            <button type="button" onClick={() => copy(String(st.dep.amount_usdt))} className="font-mono text-sm font-semibold text-tg-link">{st.dep.amount_usdt.toFixed(4)}</button>
            <p className="mt-3 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 text-tg-btn-red" /> IMPORTANT — read before sending</p>
            <Quote>
              <p>The amount must match exactly — send <b>exactly</b> this amount in USDT.</p>
              <p className="mt-1">After paying, tap <b>I paid</b> and send the {isPayId(st.dep) ? "Binance Order ID" : st.dep.kind === "bybit" ? "Internal Transfer Transaction ID" : "TXID"} — we confirm it automatically.</p>
            </Quote>
            {st.dep.qr && <QrToggle src={st.dep.qr} />}
          </Bubble>
          <Keys cols={2}>
            <Key icon={Copy} onClick={() => copy(st.dep.address)}>{isPayId(st.dep) ? "Copy ID" : "Copy address"}</Key>
            <Key icon={Coins} onClick={() => copy(String(st.dep.amount_usdt))}>Copy amount</Key>
          </Keys>
          <Key tone="green" icon={CircleCheck} onClick={() => setSt({ k: "txid", gw: st.gw, dep: st.dep })}>I paid → submit {isPayId(st.dep) ? "Order ID" : "TXID"}</Key>
          {botUser ? <a href={`https://t.me/${botUser}`} target="_blank" rel="noreferrer" className={`${btn} bg-tg-btn-green`}><Send className="h-4 w-4" /> Payment problem? Contact support</a> : null}
          <Keys cols={2}>
            <Key icon={RotateCcw} onClick={() => setSt({ k: "home" })}>Change Gateway</Key>
            <Key tone="red" icon={X} onClick={() => setSt({ k: "home" })}>Cancel</Key>
          </Keys>
        </div>
      ) : st.k === "txid" ? (
        <div key="tx" className={anim}>
          <Bubble className="w-full">
            <p className="text-sm">Send the <b>{isPayId(st.dep) ? "Binance Order ID" : st.dep.kind === "bybit" ? "Bybit Internal Transfer Transaction ID" : "Transaction ID (TXID)"}</b> of your payment.</p>
            {isPayId(st.dep) && <p className="mt-2 text-sm">Binance app → Pay → History → open the payment → copy the <b>Order ID</b>.</p>}
            <p className="mt-2 text-sm">Your payment is confirmed only when this ID matches the receiving account history.</p>
            {err && <p className="mt-2 text-sm text-tg-btn-red">{err}</p>}
          </Bubble>
          <div className="flex items-center gap-2 rounded-2xl bg-tg-bubble p-1.5 shadow-sm">
            <input className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none" value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="Paste the ID here…" />
            <button type="button" aria-label="Send" disabled={busy || txid.trim().length < 6} onClick={() => sendTx(st.gw, st.dep)} className="grid h-10 w-10 place-items-center rounded-full bg-tg-btn text-tg-btn-fg disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </div>
          {busy && <Bubble><p className="text-sm">Verifying your payment. Please wait…</p></Bubble>}
          <Key tone="red" icon={Wallet} onClick={() => setSt({ k: "pay", gw: st.gw, dep: st.dep })}>Back</Key>
        </div>
      ) : (
        <div key="res" className={anim}>
          <Bubble className="w-full">
            <p className="whitespace-pre-line text-sm">{st.msg}</p>
            {!st.ok && <p className="mt-2 text-sm italic">We keep checking automatically — this page updates when it is confirmed.</p>}
          </Bubble>
          {!st.ok && <Key icon={FileText} onClick={() => setSt({ k: "txid", gw: st.gw, dep: st.dep })}>Send a corrected ID</Key>}
          <Key tone={st.ok ? "green" : "red"} icon={Wallet} onClick={() => { void refetch(); setSt({ k: "home" }); }}>Wallet</Key>
        </div>
      )}
    </BotFrame>
  );
}

function QrToggle({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-tg-btn py-2 text-sm font-semibold text-tg-btn-fg"><QrCode className="h-4 w-4" /> {open ? "Hide QR" : "Show QR"}</button>
      {open && <img src={src} alt="Payment QR" className="mx-auto mt-2 h-52 w-52 rounded-lg bg-tg-bubble object-contain" />}
    </div>
  );
}

function OrderMsg({ o }: { o: any }) {
  const [open, setOpen] = useState(false);
  const delivered = Boolean(o.delivered_content);
  return (
    <>
      <Bubble className="w-full">
        <p className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4 text-tg-link" /> {o.product_name} × {o.quantity}</p>
        <Table rows={[
          ["Order ID", <span className="font-mono text-tg-link">#{o.order_no}</span>],
          ["Status", <span className={`uppercase ${statusCls(o.status)}`}>{o.status}</span>],
          [<><CircleCheck className="h-4 w-4" /> Total</>, priceTag(o.total)],
          ...(o.payment_method ? [[<><CreditCard className="h-4 w-4" /> Paid with</>, o.payment_method] as [ReactNode, ReactNode]] : []),
          [<>{o.delivery_type !== "auto" ? <Clock3 className="h-4 w-4" /> : <Zap className="h-4 w-4" />} Delivery</>, o.delivery_type !== "auto" ? "Manual" : "Instant"],
          [<><CalendarDays className="h-4 w-4" /> Date</>, new Date(o.created_at).toLocaleString()],
        ]} />
        {!delivered && <p className="mt-2 text-sm italic">Waiting for confirmation — your product appears here once the payment is verified.</p>}
      </Bubble>
      {delivered && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn-green px-2 text-sm font-semibold text-tg-btn-fg shadow-sm">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /> {open ? "Hide delivery" : "View delivery"}
          </button>
          {open && <BotDelivery content={o.delivered_content} orderNo={o.order_no} productName={o.product_name} />}
        </>
      )}
    </>
  );
}

/** My Orders in bot style: one message per order with delivery buttons. */
export function BotOrders({ orders, loading }: { orders: any[]; loading: boolean }) {
  return (
    <BotFrame>
      <Cmd>My Orders</Cmd>
      <div className={anim}>
        <Bubble className="w-full">
          <Title>MY ORDERS</Title>
          <p className="mt-1 text-sm">{loading ? "Loading…" : orders.length ? `${orders.length} order(s) — delivered products appear under each order.` : "You have no orders yet."}</p>
        </Bubble>
        {orders.map((o) => <OrderMsg key={o.order_no} o={o} />)}
        <Keys cols={2}>
          <KeyLink tone="green" icon={Store} to="/" onClick={() => localStorage.setItem("qorix_open", "products")}>SHOP</KeyLink>
          <KeyLink tone="red" icon={ChevronLeft} to="/">Main Menu</KeyLink>
        </Keys>
      </div>
    </BotFrame>
  );
}

const Sec = ({ children }: { children: ReactNode }) => <p className="mt-3 text-base font-bold">{children}</p>;
const Lbl = ({ icon: I, children }: { icon: LucideIcon; children: ReactNode }) => <><I className="h-4 w-4 shrink-0 text-tg-quote-bar" />{children}</>;

/** Profile page = the bot PROFILE message (account, wallet, referrals) for the connected Telegram account. */
export function BotProfile() {
  const fetchProfile = useServerFn(getWebProfile);
  const { data, isLoading } = useQuery({ queryKey: ["web-profile"], queryFn: () => fetchProfile() });
  const copy = async (t: string) => { await navigator.clipboard.writeText(t); toast.success("Link copied"); };
  const since = data?.linked && data.member_since ? new Date(data.member_since).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  return (
    <BotFrame>
      <Cmd>Profile</Cmd>
      <div className={anim}>
        <Bubble className="w-full">
          <Title>PROFILE</Title>
          {isLoading ? <p className="mt-2 text-sm">Loading…</p> : !data?.linked ? (
            <Quote>Connect your Telegram account to see your profile, wallet and referral link here.</Quote>
          ) : (
            <>
              <Sec>ACCOUNT</Sec>
              <Table rows={[
                [<Lbl icon={CreditCard}>Username</Lbl>, <span className="font-normal text-tg-link">{data.username}</span>],
                [<Lbl icon={User}>UserID</Lbl>, <span className="font-mono font-normal text-tg-link">{data.telegram_id}</span>],
                [<Lbl icon={Medal}>Membership</Lbl>, data.membership],
                [<Lbl icon={Package}>Orders</Lbl>, data.orders],
                [<Lbl icon={CalendarDays}>Member since</Lbl>, <span className="font-normal">{since}</span>],
              ]} />
              <Sec>WALLET</Sec>
              <Table rows={[
                [<Lbl icon={Wallet}>Balance</Lbl>, priceTag(data.balance)],
                [<Lbl icon={Gem}>Total Spent</Lbl>, <span className="font-normal">{priceTag(data.total_spent)}</span>],
              ]} />
              <Sec>REFERRALS</Sec>
              <Table rows={[
                [<Lbl icon={User}>Referrals</Lbl>, data.referrals],
                [<Lbl icon={Coins}>Referral Earning</Lbl>, priceTag(data.referral_earnings)],
                [<Lbl icon={Gift}>Referral Link</Lbl>, <span className="break-all font-mono text-xs font-normal text-tg-link">{data.referral_link ?? "—"}</span>],
              ]} />
            </>
          )}
        </Bubble>
        <Keys cols={2}>
          <KeyLink tone="green" icon={Package} to="/account/orders">Orders</KeyLink>
          <KeyLink tone="green" icon={Gift} to="/" onClick={() => localStorage.setItem("qorix_open", "refer")}>Refer & Earn</KeyLink>
        </Keys>
        {data?.linked && data.referral_link && (
          <Keys cols={1}>
            <Key icon={Copy} onClick={() => copy(data.referral_link!)}>Copy Link</Key>
            <a className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn-green px-2 py-2 text-sm font-semibold text-tg-btn-fg shadow-sm"
              href={`https://t.me/share/url?url=${encodeURIComponent(data.referral_link)}`} target="_blank" rel="noreferrer"><Send className="h-4 w-4" /> Share Referral Link</a>
          </Keys>
        )}
        <Keys cols={1}><KeyLink tone="red" icon={ChevronLeft} to="/">Back</KeyLink></Keys>
      </div>
    </BotFrame>
  );
}
