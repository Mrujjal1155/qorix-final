import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle, CircleDollarSign, Clock, Coins, Copy, CreditCard, FileText,
  Package, Pencil, ReceiptText, RotateCcw, Send, Store, X, ChevronLeft, CheckCircle2, Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { BotFrame } from "@/components/mobile/BotFrame";
import { Bubble, Key, KeyLink, Keys, Quote, Title } from "@/components/mobile/BotStorefront";
import { ProductPremiumIcon } from "@/components/mobile/ProductPremiumIcon";
import { productPremiumMedia } from "@/lib/product-premium-media";
import { ButtonPremiumIcon } from "@/components/mobile/ButtonPremiumIcon";
import { Button } from "@/components/ui/button";
import { PaymentGatewayIcon } from "@/components/mobile/PaymentGatewayIcon";

export type BotMethod = { id: string; label: string; icon?: LucideIcon | undefined; img?: string | undefined; address?: string | undefined };

type Stage = "summary" | "qty" | "details" | "methods" | "pay" | "txid";

export function BotCheckout(p: {
  productId: string; productName: string; productImg?: string | undefined; unit: number; qty: number; total: number;
  money: (n: number) => string; methods: BotMethod[]; method: string; setMethod: (id: string) => void;
  name: string; setName: (v: string) => void; email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void; txid: string; setTxid: (v: string) => void;
  botUser: string; epsBdt: number; placing: boolean; redirecting: boolean; connected?: boolean; checkingConnection?: boolean; connectionError?: boolean;
  onPlace: () => void; onEps: () => void; onOxa: () => void;
  walletBalance?: number; walletAllowed?: boolean; walletBusy?: boolean; onWallet?: () => void;
  initialStage?: "summary" | "methods";
}) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>(p.initialStage ?? "summary");
  const [customQty, setCustomQty] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Connected status may load after the buyer taps Pay now — never leave them on the email form.
  useEffect(() => { if (p.connected && stage === "details") setStage("methods"); }, [p.connected, stage]);
  useEffect(() => { if (stage === "methods" && !p.checkingConnection && !p.connectionError && !p.connected && (!p.name.trim() || !/^\S+@\S+\.\S+$/.test(p.email.trim()))) setStage("details"); }, [p.connected, p.checkingConnection, p.connectionError, p.name, p.email, stage]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [stage]);

  const m = p.methods.find((x) => x.id === p.method);
  const isEps = p.method === "eps";
  const isOxa = p.method === "oxapay";
  const amount = p.total.toFixed(4);
  const emailOk = /^\S+@\S+\.\S+$/.test(p.email.trim());
  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success("Copied"); };
  const setQty = (q: number) => { void navigate({ to: "/checkout", search: { id: p.productId, qty: q, step: "details" }, replace: true }); setStage("summary"); };
  const Ico = ({ i: I, c = "text-tg-link" }: { i: LucideIcon; c?: string }) => <I className={`h-4 w-4 shrink-0 ${c}`} />;
  const field = "w-full rounded-lg border border-tg-bubble-fg/15 bg-tg-bubble px-3 py-2 text-sm outline-none focus:border-tg-link";
  const anim = "animate-in fade-in slide-in-from-bottom-2 duration-300";

  return (
    <BotFrame scrollRef={scrollRef} onBack={() => setStage(stage === "summary" ? "summary" : stage === "txid" ? "pay" : stage === "pay" ? "methods" : stage === "methods" ? (p.connected ? "summary" : "details") : "summary")}>
      <div className="mb-1 self-end rounded-2xl rounded-br-md bg-tg-header px-3 py-1.5 text-sm text-tg-link shadow-sm">/checkout</div>

      {(stage === "summary" || stage === "qty") && (
        <div key="sum" className={`flex flex-col gap-1.5 ${anim}`}>
          <Bubble>
            <Title>CHECKOUT</Title>
            <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />
            <p className="flex items-center gap-2 font-semibold">
              {productPremiumMedia(p.productId) ? <ProductPremiumIcon productId={p.productId} /> : p.productImg ? <img src={p.productImg} alt="" className="h-5 w-5 rounded object-cover" /> : <Ico i={Package} />}
              <span className="min-w-0 break-words">{p.productName}</span>
            </p>
            <p className="pl-7 text-sm">{p.qty} × {p.money(p.unit)} = <b>{p.money(p.total)}</b></p>
            <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />
            <p className="flex items-center gap-2 text-sm"><Ico i={ReceiptText} /> Subtotal: {p.money(p.total)}</p>
            <p className="flex items-center gap-2 text-sm"><Ico i={CircleDollarSign} c="text-tg-btn-green" /> Total to pay: <b>{p.money(p.total)}</b></p>
            <p className="mt-2 text-sm italic">No wallet deposit needed — pay directly and it will be verified automatically.</p>
          </Bubble>
          {stage === "qty" ? (
            <>
              <Bubble><p className="flex items-center gap-2 text-sm"><Ico i={Pencil} /> Choose a new quantity:</p></Bubble>
              <Keys cols={3}>{[1, 2, 3, 5, 10].map((q) => <Key key={q} active={q === p.qty} onClick={() => setQty(q)}>{q}×</Key>)}</Keys>
              <form className="flex gap-1.5" onSubmit={(e) => {
                e.preventDefault();
                const q = Math.floor(Number(customQty));
                if (!Number.isFinite(q) || q < 1 || q > 100000) { toast.error("Enter a valid quantity."); return; }
                setCustomQty(""); setQty(q);
              }}>
                <input type="number" inputMode="numeric" min={1} max={100000} value={customQty} onChange={(e) => setCustomQty(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Custom quantity" aria-label="Custom quantity" className={`${field} min-h-11 flex-1`} />
                <Button type="submit" variant="ghost" className="min-h-11 rounded-xl bg-tg-btn-green px-4 text-sm font-semibold text-tg-btn-fg shadow-sm active:scale-[0.98]"><ButtonPremiumIcon setting="ui_icon_qty_custom" />Confirm</Button>
              </form>
              <Key premium="ui_icon_pay_back" tone="red" icon={ChevronLeft} onClick={() => setStage("summary")}>Back</Key>
            </>
          ) : (
            <>
              <Key premium="ui_icon_co_pay" tone="green" icon={CreditCard} disabled={Boolean(p.checkingConnection || p.connectionError)} onClick={() => setStage(p.connected ? "methods" : "details")}>{p.checkingConnection ? "Checking account…" : p.connectionError ? "Account check failed — refresh" : `Pay now · ${p.money(p.total)}`}</Key>
              <Key premium="ui_icon_qty_custom" icon={Pencil} onClick={() => setStage("qty")}>Change quantity</Key>
              <Keys cols={2}>
                <KeyLink premium="menu_icon_shop" tone="green" icon={Store} to="/" onClick={() => localStorage.setItem("qorix_open", "products")}>SHOP</KeyLink>
                <KeyLink premium="menu_icon_back" tone="red" icon={ChevronLeft} to="/">Main Menu</KeyLink>
              </Keys>
            </>
          )}
        </div>
      )}

      {stage === "details" && !p.connected && (
        <div key="det" className={`flex flex-col gap-1.5 ${anim}`}>
          <Bubble className="w-full">
            <p className="flex items-center gap-2 font-semibold"><Ico i={FileText} /> Delivery details</p>
            <p className="mt-1 text-sm">Your products and receipt are sent to this email.</p>
            <div className="mt-2 space-y-2">
              <input className={field} value={p.name} onChange={(e) => p.setName(e.target.value)} placeholder="Your name" autoComplete="name" />
              <input className={field} type="email" value={p.email} onChange={(e) => p.setEmail(e.target.value)} placeholder="you@mail.com" autoComplete="email" />
            </div>
          </Bubble>
          <Key premium="ui_icon_dep_paid_txid" tone="green" icon={CheckCircle2} disabled={!p.name.trim() || !emailOk} onClick={() => setStage("methods")}>Continue</Key>
          <Key premium="ui_icon_pay_back" tone="red" icon={ChevronLeft} onClick={() => setStage("summary")}>Back</Key>
        </div>
      )}

      {stage === "methods" && (
        <div key="met" className={`flex flex-col gap-1.5 ${anim}`}>
          <Bubble>
            <p className="flex items-center gap-2 font-semibold"><Ico i={CreditCard} /> Select Payment Method</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold"><Ico i={Package} /> {p.productName} x {p.qty}</p>
            <p className="text-sm">Total: <b>{p.total.toFixed(2)} USDT</b></p>
            {p.connected && <p className="mt-1 flex items-center gap-2 text-xs text-tg-muted"><Send className="h-3.5 w-3.5" /> Saved to your connected Telegram account.</p>}
          </Bubble>
          {p.connected && <Key premium="ui_icon_pay_balance" icon={Wallet} disabled={!p.walletAllowed || Boolean(p.walletBusy)} onClick={() => p.onWallet?.()}>{p.walletBusy ? "Purchasing…" : `Pay with Wallet · ${(p.walletBalance ?? 0).toFixed(2)} USDT`}</Key>}
          {p.methods.map((x) => (
            <Key key={x.id} disabled={Boolean(p.checkingConnection || p.connectionError)} leading={<PaymentGatewayIcon gateway={x.id} img={x.img} icon={x.icon} />} onClick={() => { p.setMethod(x.id); setStage("pay"); }}>{x.label}</Key>
          ))}
          {p.methods.length === 0 && <Bubble><p className="text-sm">No payment method is available right now — please contact support.</p></Bubble>}
          <Key premium="ui_icon_pay_back" tone="red" icon={ChevronLeft} onClick={() => setStage(p.connected ? "summary" : "details")}>Back</Key>
        </div>
      )}

      {stage === "pay" && m && (
        <div key="pay" className={`flex flex-col gap-1.5 ${anim}`}>
          <Bubble className="w-full">
            <p className="flex items-center gap-2 text-sm"><Ico i={Package} /> <b>Order:</b> {p.qty}x {p.productName}</p>
            <p className="mt-2 flex items-start gap-2 text-sm"><Ico i={Clock} c="mt-0.5 text-tg-btn-red" /> <span>This order stays open for 30 minutes. If the payment is not made and confirmed within that time, it can be cancelled automatically.</span></p>
            <p className="mt-3 flex items-center gap-2 font-bold"><PaymentGatewayIcon gateway={m.id} img={m.img} icon={m.icon} /> {m.label}</p>
            {isEps || isOxa ? (
              <>
                <p className="mt-2 text-sm">{isEps ? "You will be taken to the secure EPS page to pay with bKash, Nagad, Rocket or card." : "You will be taken to the secure crypto page — USDT, BTC, LTC & more, confirmed automatically."}</p>
                {isEps && <input className={`${field} mt-2`} inputMode="tel" value={p.phone} onChange={(e) => p.setPhone(e.target.value)} placeholder="Mobile number 01XXXXXXXXX" />}
                <p className="mt-2 text-sm">Amount: <b className="font-mono">{isEps ? `৳${p.epsBdt.toFixed(2)}` : `${p.total.toFixed(2)} USD`}</b></p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm">{p.method === "binance" ? <>Open Binance app → <b>Pay</b> → <b>Send</b> → paste this Pay ID:</> : p.method === "bybit" ? <>Bybit app → <b>Transfer</b> → internal transfer to this UID:</> : <>Send USDT on this network only to:</>}</p>
                <button type="button" onClick={() => m.address && copy(m.address)} className="block break-all text-left font-mono text-sm font-semibold text-tg-link">{m.address || "Not configured — contact support"}</button>
                <p className="mt-3 flex items-center gap-2 text-sm"><Ico i={CircleDollarSign} c="text-tg-btn-green" /> Amount to send (tap to copy):</p>
                <button type="button" onClick={() => copy(amount)} className="font-mono text-sm font-semibold text-tg-link">{amount}</button>
                <p className="mt-3 flex items-center gap-2 font-bold"><Ico i={AlertTriangle} c="text-tg-btn-red" /> IMPORTANT — read before sending</p>
                <Quote>
                  <p>The amount must match exactly — send <b>exactly</b> this amount in USDT.</p>
                  <p className="mt-1">After paying, tap <b>I have paid</b> and send the transaction / order ID — we confirm it automatically.</p>
                </Quote>
              </>
            )}
          </Bubble>
          {isEps || isOxa ? (
            <Key premium="ui_icon_co_pay" tone="green" icon={CreditCard} disabled={p.redirecting || (isEps && p.phone.replace(/\D/g, "").length < 11) || Boolean(!p.connected && (!p.name.trim() || !emailOk))} onClick={isEps ? p.onEps : p.onOxa}>
              {p.redirecting ? "Opening secure payment…" : "Pay securely"}
            </Key>
          ) : (
            <>
              <Keys cols={2}>
                <Key premium={p.method === "binance" ? "ui_icon_dep_copy_id" : "ui_icon_dep_copy_address"} icon={Copy} onClick={() => m.address && copy(m.address)}>{p.method === "binance" ? "Copy ID" : "Copy address"}</Key>
                <Key premium="ui_icon_co_total" icon={Coins} onClick={() => copy(amount)}>Copy amount</Key>
              </Keys>
              <Key premium="ui_icon_dep_paid_txid" tone="green" icon={CheckCircle2} onClick={() => setStage("txid")}>I paid → submit {p.method === "binance" ? "Order ID" : "TXID"}</Key>
            </>
          )}
          {p.botUser ? (
            <a href={`https://t.me/${p.botUser}`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn-green px-2 text-sm font-semibold text-tg-btn-fg shadow-sm">
              <ButtonPremiumIcon setting="ui_icon_dep_support" fallback={Send} /> Payment problem? Contact support
            </a>
          ) : null}
          <Keys cols={2}>
            <Key premium="ui_icon_dep_change_gateway" icon={RotateCcw} onClick={() => setStage("methods")}>Change Gateway</Key>
            <Key premium="ui_icon_dep_cancel" tone="red" icon={X} onClick={() => setStage("summary")}>Cancel</Key>
          </Keys>
        </div>
      )}

      {stage === "txid" && m && (
        <div key="tx" className={`flex flex-col gap-1.5 ${anim}`}>
          <Bubble className="w-full">
            <p className="flex items-start gap-2 text-sm"><Ico i={FileText} c="mt-0.5" /> <span>Send the <b>{p.method === "binance" ? "Binance Order ID" : p.method === "bybit" ? "Bybit internal transfer ID" : "blockchain TXID"}</b> of your payment.</span></p>
            {p.method === "binance" && <p className="mt-2 text-sm">Binance app → Pay → History → open the payment → copy the <b>Order ID</b>.</p>}
            <p className="mt-2 text-sm">Your payment is confirmed only when this ID matches the receiving account history.</p>
          </Bubble>
          <div className="flex items-center gap-2 rounded-2xl bg-tg-bubble p-1.5 shadow-sm">
            <input className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none" value={p.txid} onChange={(e) => p.setTxid(e.target.value)} placeholder="Paste the ID here…" />
            <button type="button" aria-label="Send" disabled={!p.txid.trim() || p.placing} onClick={p.onPlace} className="grid h-10 w-10 place-items-center rounded-full bg-tg-btn text-tg-btn-fg disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </div>
          {p.placing && <Bubble><p className="text-sm">Checking your payment…</p></Bubble>}
          <Key premium="ui_icon_pay_back" tone="red" icon={ChevronLeft} onClick={() => setStage("pay")}>Back</Key>
        </div>
      )}
    </BotFrame>
  );
}

