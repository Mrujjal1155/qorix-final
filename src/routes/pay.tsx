import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Copy, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { BotFrame } from "@/components/mobile/BotFrame";
import { Bubble, Quote } from "@/components/mobile/BotStorefront";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaymentGatewayIcon } from "@/components/mobile/PaymentGatewayIcon";
import { checkBrowserPayment, createBrowserPayment, previewBrowserPayment } from "@/lib/browser-payment.functions";
import { browserPaymentInput, type BrowserGateway } from "@/lib/bot/browser-payment";

export const Route = createFileRoute("/pay")({
  head: () => ({ meta: [
    { title: "Direct Payment — QORIX Store" },
    { name: "description", content: "Pay your reserved QORIX Telegram order securely in your browser." },
    { property: "og:title", content: "Direct Payment — QORIX Store" },
    { property: "og:description", content: "Complete payment for your Telegram order. Delivery stays in the original chat." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex,nofollow" }, { name: "referrer", content: "no-referrer" },
  ] }),
  component: BrowserPaymentPage,
});

function BrowserPaymentPage() {
  const preview = useServerFn(previewBrowserPayment);
  const start = useServerFn(createBrowserPayment);
  const check = useServerFn(checkBrowserPayment);
  const [token, setToken] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [txid, setTxid] = useState("");
  useEffect(() => {
    // Fragment credentials never enter server URLs, analytics query strings or referrers.
    const parsed = browserPaymentInput.safeParse({ token: window.location.hash.slice(1) });
    if (parsed.success) setToken(parsed.data.token);
    setInitialized(true);
  }, []);
  const query = useQuery({ queryKey: ["browser-payment", token], enabled: Boolean(token), queryFn: () => preview({ data: { token } }), refetchInterval: q => q.state.data && ["starting", "pending"].includes(q.state.data.status) ? 8000 : false, retry: false });
  const payment = query.data;
  const deposit = payment?.deposit;
  const hosted = deposit?.kind === "eps" || deposit?.kind === "oxapay";
  const action = "min-h-12 w-full whitespace-normal bg-tg-btn px-3 text-tg-btn-fg hover:bg-tg-btn/90";
  async function choose(gateway: BrowserGateway) {
    setBusy(true); setMessage("");
    try { await start({ data: { token, gateway } }); await query.refetch(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Payment could not be opened."); await query.refetch(); }
    finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setMessage("");
    try {
      const result = await check({ data: { token, txid } });
      if (result.status !== "paid") setMessage("Payment is not confirmed yet. We will deliver in Telegram after verification; do not pay again.");
      await query.refetch();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not check payment yet."); }
    finally { setBusy(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Copied."); }
    catch { setMessage("Could not copy. Select the value and copy it manually."); }
  }
  return <BotFrame>
    <Bubble className="w-full">
      <h1 className="flex items-center gap-2 text-base font-bold"><CreditCard className="h-5 w-5 text-tg-link" /> DIRECT PAYMENT</h1>
      {!initialized || (token && query.isPending) ? <p className="mt-3 text-sm">Checking your payment link…</p> : !token || query.isError ? <p className="mt-3 text-sm text-tg-btn-red">This link is invalid or unavailable. Open a fresh Direct Payment link from the bot.</p> : payment ? <>
        <div className="mt-3 divide-y divide-tg-bubble-fg/10">
          {payment.orders.map(order => <div key={order.number} className="py-2 text-sm"><p className="font-semibold">{order.name}</p><p className="mt-1 text-tg-muted">Order #{order.number} · Qty ×{order.quantity}</p><p className="mt-1">${order.total.toFixed(2)}</p></div>)}
        </div>
        <p className="mt-2 text-base font-bold">Total: ${payment.total.toFixed(2)}</p>
        {payment.status === "paid" ? <Quote><p className="flex items-center gap-2 font-bold text-tg-btn-green"><CheckCircle className="h-5 w-5" /> Payment verified</p><p className="mt-2 text-sm">Delivery stays in your original Telegram chat. Manual orders remain with our team. Do not pay again.</p></Quote> : payment.status === "expired" || payment.status === "failed" ? <Quote><p className="text-sm text-tg-btn-red">This payment link expired, was cancelled or could not be opened. Do not send payment. Contact support if you already paid.</p></Quote> : <Quote><p className="text-sm">Pay before {new Date(payment.expires_at).toLocaleString()}. Delivery stays in the original Telegram chat.</p></Quote>}
        {payment.status === "starting" && <p className="mt-3 text-sm">Payment is being prepared. Refresh to check; do not create another payment.</p>}
        {deposit && !hosted && <div className="mt-4 space-y-3 text-sm">
          <p className="font-bold">{deposit.kind === "payid" ? "Binance Pay ID" : deposit.kind === "bybit" ? "Bybit receiving UID" : `USDT receiving address · ${deposit.network ?? deposit.gateway.replace("chain_", "").toUpperCase()}`}</p>
          <p className="break-all font-mono text-tg-link">{deposit.address}</p>
          <Button variant="outline" className="w-full" onClick={() => copy(deposit.address)}><Copy /> Copy {deposit.kind === "payid" || deposit.kind === "bybit" ? "ID" : "address"}</Button>
          <p>Send exactly <b>{deposit.amount} USDT</b>. Network fees are separate.</p>
          <Button variant="outline" className="w-full" onClick={() => copy(String(deposit.amount))}><Copy /> Copy amount</Button>
          <label htmlFor="payment-txid" className="block font-medium">{deposit.kind === "payid" ? "Binance Order ID" : deposit.kind === "bybit" ? "Internal Transfer Transaction ID" : "Transaction ID (TXID)"}</label>
          <Input id="payment-txid" value={txid} onChange={e => setTxid(e.target.value)} maxLength={128} autoComplete="off" placeholder="Enter your payment transaction ID" />
        </div>}
      </> : null}
      {message && <p role="status" className="mt-3 text-sm text-tg-link">{message}</p>}
    </Bubble>
    {payment?.status === "ready" && payment.gateways.map(gateway => <Button key={gateway.id} disabled={busy} className={action} onClick={() => choose(gateway.id)}><PaymentGatewayIcon gateway={gateway.id} icon={CreditCard} />{gateway.label}</Button>)}
    {payment?.status === "ready" && !payment.gateways.length && <Bubble><p className="text-sm">No payment method is currently available. Please contact support in Telegram.</p></Bubble>}
    {deposit && hosted && /^https:\/\//.test(deposit.address) && <Button asChild className={action}><a href={deposit.address} target="_blank" rel="noreferrer"><ExternalLink /> Open secure payment</a></Button>}
    {payment?.status === "pending" && <Button disabled={busy || (!hosted && txid.trim().length < 6)} className={action} onClick={verify}><CheckCircle />{busy ? "Checking…" : hosted ? "Check payment" : "I paid — verify payment"}</Button>}
    {token && <Button variant="outline" disabled={busy} className="min-h-11 w-full" onClick={() => void query.refetch()}><RefreshCw />Refresh</Button>}
    <Button asChild className={action}><Link to="/">Main Menu</Link></Button>
  </BotFrame>;
}