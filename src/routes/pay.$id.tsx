import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, CreditCard, ExternalLink, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { BotFrame } from "@/components/mobile/BotFrame";
import { Bubble, Key, Keys, Quote } from "@/components/mobile/BotStorefront";
import { getDirectPay, beginDirectPay } from "@/lib/direct-pay.functions";

export const Route = createFileRoute("/pay/$id")({
  loader: async ({ params }) => {
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) return { status: "invalid" as const };
    return await getDirectPay({ data: { id: params.id } });
  },
  head: () => ({
    meta: [
      { title: "Direct Payment — QORIX Store" },
      { name: "description", content: "Pay your Telegram bot order securely on QORIX Store; delivery arrives in the bot." },
      { property: "og:title", content: "Direct Payment — QORIX Store" },
      { property: "og:description", content: "Secure one-time payment link for your QORIX Telegram order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PayPage,
});

const usd = (n: number) => `$${n.toFixed(2)}`;

function PayPage() {
  const info = Route.useLoaderData() as any;
  const { id } = Route.useParams();
  const router = useRouter();
  const begin = useServerFn(beginDirectPay);
  const [busy, setBusy] = useState<string | null>(null);
  const toBot = () => { window.location.href = info.botLink || "https://t.me/QORIX3_bot"; };

  const choose = async (method: string) => {
    setBusy(method);
    try {
      const r: any = await begin({ data: { id, method } });
      if (r?.error) toast.error(r.error); else await router.invalidate();
    } catch { toast.error("Could not start the payment. Please try again."); }
    finally { setBusy(null); }
  };

  const p = info.payment;
  return <BotFrame onBack={toBot} onMenu={toBot}>
    <div className="flex flex-col gap-2 p-3">
      <Bubble>
        <p className="font-bold">🔗 Direct Payment</p>
        {info.status === "invalid" ? <p className="mt-2 text-sm">This payment link is not valid. Open a fresh link from the bot.</p> : <>
          <Quote>{info.items.map((it: any, i: number) => <p key={i}>• {it.name} × {it.qty} — {usd(it.subtotal)}</p>)}</Quote>
          <p className="mt-2 text-sm"><b>Total:</b> {usd(info.total)}</p>
          {info.status === "open" && <p className="mt-2 text-xs text-tg-muted">Choose a payment method. Your order is delivered in the Telegram bot automatically after payment. Link valid for 30 minutes, one payment only.</p>}
          {info.status === "expired" && <p className="mt-2 text-sm">⏳ This link has expired. Open the bot and create a new Direct Payment link.</p>}
        </>}
      </Bubble>

      {info.status === "open" && <Keys cols={1}>
        {info.methods.length === 0 && <Bubble>No website payment method is available right now.</Bubble>}
        {info.methods.map((m: any) => <Key key={m.id} icon={m.id.startsWith("eps") ? CreditCard : Wallet} disabled={!!busy} onClick={() => void choose(m.id)}>{busy === m.id ? "Creating…" : m.label}</Key>)}
      </Keys>}

      {p && <Bubble>
        <p className="font-bold">Payment · {usd(p.amount)}{p.bdt ? ` (৳${p.bdt.toFixed(2)})` : ""}</p>
        {p.status !== "pending" && <p className="mt-1 text-sm">Status: <b>{p.status}</b></p>}
        {p.payUrl ? <p className="mt-2 text-sm">Finish the payment on the secure page. Delivery arrives in the bot once it is confirmed.</p> : <>
          <p className="mt-2 text-sm">Send exactly <b>{p.amount}</b> USDT to:</p>
          <Quote><span className="break-all font-mono">{p.address}</span></Quote>
          <p className="mt-2 text-xs text-tg-muted">Then open the bot and tap “I paid” on the payment message to submit your TXID.</p>
        </>}
      </Bubble>}
      {p && <Keys cols={1}>
        {p.payUrl && p.status === "pending" && <Key tone="green" icon={ExternalLink} onClick={() => { window.location.href = p.payUrl; }}>Pay now</Key>}
        {p.address && <Key icon={Copy} onClick={() => { void navigator.clipboard.writeText(p.address); toast.success("Copied"); }}>Copy address</Key>}
      </Keys>}
      <Keys cols={1}><Key icon={Send} onClick={toBot}>Open Telegram bot</Key></Keys>
    </div>
  </BotFrame>;
}
