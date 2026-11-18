import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, ChevronLeft, CircleCheck, Clock3, Copy, CreditCard, Gift, Package, Store, User, Wallet, Zap, Info } from "lucide-react";
import { BotFrame } from "@/components/mobile/BotFrame";
import { Bubble, KeyLink, Keys, Quote, Title } from "@/components/mobile/BotStorefront";
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

/** Deposit / Wallet message in bot style (website pays at checkout, so it shows the account summary). */
export function BotWallet({ email, stats, orders }: { email?: string | undefined; stats?: any; orders: any[] }) {
  const recent = orders.slice(0, 5);
  return (
    <BotFrame>
      <Cmd>Deposit</Cmd>
      <div className={anim}>
        <Bubble className="w-full">
          <Title>WALLET</Title>
          <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />
          {email ? <p className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-tg-link" /> {email}</p> : null}
          <Table rows={[
            [<><Package className="h-4 w-4 text-tg-link" /> Total orders</>, stats?.totalOrders ?? 0],
            [<><CircleCheck className="h-4 w-4 text-tg-btn-green" /> Completed</>, stats?.completed ?? 0],
            [<><Clock3 className="h-4 w-4 text-tg-btn-red" /> Pending</>, stats?.pending ?? 0],
            [<><Wallet className="h-4 w-4 text-tg-link" /> Total spent</>, priceTag(stats?.spent ?? 0)],
          ]} />
          <Quote><p className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" /> <span>No wallet deposit needed on the website — pay directly at checkout and it is verified automatically.</span></p></Quote>
        </Bubble>
        {recent.length > 0 && (
          <Bubble className="w-full">
            <p className="font-bold">Recent orders</p>
            <Table rows={recent.map((o) => [<span className="font-mono">#{o.order_no}</span>, <span className="flex justify-end gap-2"><span className="truncate font-normal">{o.quantity}× {o.product_name}</span><span className={`uppercase ${statusCls(o.status)}`}>{o.status}</span></span>])} />
          </Bubble>
        )}
        <Keys cols={2}>
          <KeyLink tone="green" icon={Store} to="/store">SHOP</KeyLink>
          <KeyLink icon={Package} to="/account/orders">My Orders</KeyLink>
          <KeyLink icon={User} to="/account/profile">Profile</KeyLink>
          <KeyLink icon={Gift} to="/account/referrals">Referrals</KeyLink>
        </Keys>
        <KeyLink tone="red" icon={ChevronLeft} to="/">Main Menu</KeyLink>
      </div>
    </BotFrame>
  );
}

function OrderMsg({ o }: { o: any }) {
  const [open, setOpen] = useState(false);
  const delivered = Boolean(o.delivered_content);
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copied"); };
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
        {delivered && open && (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-tg-quote p-2 font-mono text-xs">{o.delivered_content}</pre>
        )}
      </Bubble>
      {delivered && (
        <Keys cols={2}>
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn-green px-2 text-sm font-semibold text-tg-btn-fg shadow-sm">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /> {open ? "Hide delivery" : "View delivery"}
          </button>
          <button type="button" onClick={() => copy(o.delivered_content)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn px-2 text-sm font-semibold text-tg-btn-fg shadow-sm">
            <Copy className="h-4 w-4" /> Copy
          </button>
        </Keys>
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
          <KeyLink tone="green" icon={Store} to="/store">SHOP</KeyLink>
          <KeyLink tone="red" icon={ChevronLeft} to="/">Main Menu</KeyLink>
        </Keys>
      </div>
    </BotFrame>
  );
}
