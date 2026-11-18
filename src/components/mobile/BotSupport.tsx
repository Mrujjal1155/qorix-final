import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, Copy, FileText, Gift, Link2, LifeBuoy, Send, Ticket, User, Users, Coins, Lock, RefreshCw, Store, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Bubble, Key, Keys, Quote, Title } from "@/components/mobile/BotStorefront";
import { claimWebReward, createWebTicket, getWebReferralStore, getWebSupport, getWebTicket, getWebTickets, replyWebTicket } from "@/lib/web-wallet.functions";

type Go = (v: "menu" | "support" | "tg" | "profile") => void;
const Hr = () => <div className="my-1.5 h-px w-40 bg-tg-bubble-fg/40" />;
const DEFAULT_RULES = [
  <>Response time can vary from <b>24 to 72 hours</b>. Please be patient and do not create duplicate tickets.</>,
  <>Refunds eligible <b>strictly as per product description</b> terms &amp; time.</>,
  <><b>Video Proof:</b> Uncut video of purchase &amp; issue is mandatory for refund/replacement <i>(if stated in product description)</i>. No video = no refund.</>,
  <>Technical assistance is provided for all orders.</>,
];

/** SUPPORT — same text, rules and ticket actions as the bot. */
export function BotSupportView({ signedIn, go }: { signedIn: boolean; go: Go }) {
  const fetchInfo = useServerFn(getWebSupport);
  const { data: info } = useQuery({ queryKey: ["web-support"], queryFn: () => fetchInfo(), staleTime: 60_000 });
  const [mode, setMode] = useState<{ k: "home" } | { k: "new" } | { k: "list" } | { k: "ticket"; id: string }>({ k: "home" });

  if (mode.k === "new") return <NewTicket onBack={() => setMode({ k: "home" })} onDone={(id) => setMode({ k: "ticket", id })} />;
  if (mode.k === "list") return <TicketList onBack={() => setMode({ k: "home" })} onOpen={(id) => setMode({ k: "ticket", id })} onNew={() => setMode({ k: "new" })} />;
  if (mode.k === "ticket") return <TicketThread id={mode.id} onBack={() => setMode({ k: "list" })} />;

  return (
    <>
      <Bubble>
        <Title>SUPPORT</Title>
        <Hr />
        <p className="text-sm whitespace-pre-line">{info?.body ?? "Contact our support team."}</p>
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-tg-btn-red" /> Support Rules:</p>
        <ul className="mt-1 space-y-0.5 text-sm">
          {(info?.rules ?? DEFAULT_RULES).map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
        <Hr />
        <p className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-tg-quote-bar" /> Admin — <a className="text-tg-link" href={info?.link ?? "https://t.me/QORIXadmin"} target="_blank" rel="noreferrer">{info?.handle ?? "@QORIXadmin"}</a></p>
      </Bubble>
      {signedIn ? (
        <Keys cols={1}>
          <Key tone="green" icon={LifeBuoy} onClick={() => setMode({ k: "new" })}>Create Support Ticket</Key>
          <Key tone="green" icon={Ticket} onClick={() => setMode({ k: "list" })}>My Tickets</Key>
          <Key tone="red" icon={ArrowLeft} onClick={() => go("menu")}>Back</Key>
        </Keys>
      ) : (
        <>
          <Bubble><p className="text-sm italic">Support tickets are linked to your Telegram account. Connect Telegram to create and follow tickets here, or message the admin directly.</p></Bubble>
          <Keys cols={1}>
            <Key tone="green" icon={Send} onClick={() => go("tg")}>Connect Telegram</Key>
            <a href={info?.link ?? "https://t.me/QORIXadmin"} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn px-2 py-2 text-sm font-semibold text-tg-btn-fg shadow-sm"><User className="h-4 w-4" /> Message Admin</a>
            <Key tone="red" icon={ArrowLeft} onClick={() => go("menu")}>Back</Key>
          </Keys>
        </>
      )}
    </>
  );
}

function NewTicket({ onBack, onDone }: { onBack: () => void; onDone: (id: string) => void }) {
  const create = useServerFn(createWebTicket);
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await create({ data: { body } });
      if ("error" in r) toast.error(r.error);
      else { toast.success(`Ticket ${r.ticket.code} created`); void qc.invalidateQueries({ queryKey: ["web-tickets"] }); onDone(r.ticket.id); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create ticket"); } finally { setBusy(false); }
  };
  return (
    <>
      <Bubble>
        <p className="flex items-center gap-2 font-bold"><LifeBuoy className="h-4 w-4 text-tg-btn-red" /> Create Support Ticket</p>
        <Quote>Describe your issue in one message — include your Order ID and what went wrong. Our team will reply here and in the bot.</Quote>
      </Bubble>
      <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} rows={5} placeholder="Write your message…"
        className="w-full rounded-xl border border-tg-bubble-fg/15 bg-tg-bubble px-3 py-2 text-sm text-tg-bubble-fg outline-none focus:border-tg-link" />
      <Keys cols={1}>
        <Key tone="green" icon={Send} disabled={busy || body.trim().length < 3} onClick={submit}>{busy ? "Sending…" : "Send Ticket"}</Key>
        <Key tone="red" icon={ArrowLeft} onClick={onBack}>Back</Key>
      </Keys>
    </>
  );
}

function TicketList({ onBack, onOpen, onNew }: { onBack: () => void; onOpen: (id: string) => void; onNew: () => void }) {
  const fetchList = useServerFn(getWebTickets);
  const { data, isLoading } = useQuery({ queryKey: ["web-tickets"], queryFn: () => fetchList() });
  const list = data?.tickets ?? [];
  return (
    <>
      <Bubble>
        <p className="flex items-center gap-2 font-bold"><Ticket className="h-4 w-4 text-tg-link" /> My Tickets</p>
        <p className="text-sm">{isLoading ? "Loading…" : list.length ? `${list.length} ticket(s). Tap one to open.` : "You have no tickets yet."}</p>
      </Bubble>
      <Keys cols={1}>
        {list.map((t) => (
          <Key key={t.id} tone={t.status === "closed" ? "red" : "blue"} icon={Ticket} onClick={() => onOpen(t.id)}>
            {t.code} · {t.subject} · {t.status}{t.unread > 0 ? ` · ${t.unread} new` : ""}
          </Key>
        ))}
        <Key tone="green" icon={LifeBuoy} onClick={onNew}>Create Support Ticket</Key>
        <Key tone="red" icon={ArrowLeft} onClick={onBack}>Back</Key>
      </Keys>
    </>
  );
}

function TicketThread({ id, onBack }: { id: string; onBack: () => void }) {
  const fetchT = useServerFn(getWebTicket);
  const reply = useServerFn(replyWebTicket);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["web-ticket", id], queryFn: () => fetchT({ data: { id } }), refetchInterval: 15_000 });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { const r = await reply({ data: { id, body } }); if (r.ok) { setBody(""); await refetch(); } else toast.error("This ticket is closed."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not send"); } finally { setBusy(false); }
  };
  return (
    <>
      <Bubble className="w-full">
        <p className="flex items-center gap-2 font-bold"><Ticket className="h-4 w-4 text-tg-link" /> {data?.code ?? "Ticket"} · {data?.status ?? ""}</p>
        <p className="text-sm">{data?.subject}</p>
      </Bubble>
      {isLoading && <Bubble>Loading…</Bubble>}
      {data?.messages.map((m, i) => m.sender === "user"
        ? <div key={i} className="max-w-[85%] self-end whitespace-pre-line rounded-2xl rounded-br-md bg-tg-header px-3 py-2 text-sm shadow-sm">{m.body}</div>
        : <Bubble key={i}><p className="text-xs font-semibold text-tg-link">Support</p><p className="whitespace-pre-line text-sm">{m.body}</p></Bubble>)}
      {data && data.status !== "closed" && (
        <>
          <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} rows={3} placeholder="Write a reply…"
            className="w-full rounded-xl border border-tg-bubble-fg/15 bg-tg-bubble px-3 py-2 text-sm text-tg-bubble-fg outline-none focus:border-tg-link" />
          <Keys cols={1}><Key tone="green" icon={Send} disabled={busy || body.trim().length < 3} onClick={send}>Send Reply</Key></Keys>
        </>
      )}
      <Keys cols={2}>
        <Key icon={RefreshCw} onClick={() => void refetch()}>Refresh</Key>
        <Key tone="red" icon={ArrowLeft} onClick={onBack}>Back</Key>
      </Keys>
    </>
  );
}

/** REFER + EARN — the bot Referral Store: link, code, referrals, credits, rewards and purchases. */
export function BotReferralView({ signedIn, go }: { signedIn: boolean; go: Go }) {
  const fetchStore = useServerFn(getWebReferralStore);
  const claim = useServerFn(claimWebReward);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["web-refstore"], queryFn: () => fetchStore(), enabled: signedIn });
  const [showBought, setShowBought] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <>
        <Bubble>
          <Title>REFER + EARN</Title>
          <Hr />
          <Quote>Want to earn by referring friends? Connect your Telegram account to see your referral link, credits and rewards.</Quote>
        </Bubble>
        <Keys cols={1}>
          <Key tone="green" icon={Send} onClick={() => go("tg")}>Connect Telegram</Key>
          <Key tone="red" icon={ArrowLeft} onClick={() => go("menu")}>Back</Key>
        </Keys>
      </>
    );
  }
  if (isLoading || !data) return <Bubble>{isLoading ? "Loading…" : "Referral details are not available right now."}</Bubble>;

  const copy = async (t: string) => { await navigator.clipboard.writeText(t); toast.success("Copied"); };
  const doClaim = async (id: string) => {
    setBusy(id);
    try { const r = await claim({ data: { id } }); r.ok ? toast.success(r.message) : toast.error(r.message); await refetch(); }
    finally { setBusy(null); }
  };

  if (showBought) {
    return (
      <>
        <Bubble className="w-full">
          <p className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4 text-tg-link" /> My Purchases</p>
          <Hr />
          {data.requests.map((r, i) => <p key={`r${i}`} className="text-sm">• <b>{r.name}</b> — {r.credits} points · <b>{r.status}</b></p>)}
          {data.requests.length > 0 && <Hr />}
          {data.purchases.length ? data.purchases.map((p, i) => <p key={i} className="text-sm">{i + 1}. <b>{p.name}</b> — {p.credits} <i>({new Date(p.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})</i></p>)
            : <p className="text-sm">No reward claimed yet.</p>}
          <Hr />
          <p className="flex items-center gap-2 text-sm"><Coins className="h-4 w-4 text-tg-quote-bar" /> Credits left: <b>{data.credits}</b></p>
        </Bubble>
        <Keys cols={1}>
          <Key tone="green" icon={Gift} onClick={() => setShowBought(false)}>Refer &amp; Earn</Key>
          <Key tone="red" icon={ChevronLeft} onClick={() => go("profile")}>Back to Profile</Key>
        </Keys>
      </>
    );
  }

  return (
    <>
      <Bubble className="w-full">
        <Title>REFER + EARN</Title>
        <Hr />
        <p className="font-semibold">How it works</p>
        <ul className="text-sm">
          <li>• Invite a brand-new member with <b>your link</b> — each one earns you <b>{data.per} credit{data.per > 1 ? "s" : ""}</b>.</li>
          <li>• The credit lands once your friend opens the shop and <b>views a product</b>.</li>
          <li>• Up to <b>{data.cap} invites per day</b> are counted — extra invites simply wait for the next day.</li>
          <li>• Spend credits on the rewards below.</li>
        </ul>
        <p className="mt-3 flex items-center gap-2 text-sm"><Link2 className="h-4 w-4 text-tg-link" /> Referral Link</p>
        <button type="button" onClick={() => copy(data.link)} className="break-all text-left font-mono text-xs text-tg-link">{data.link}</button>
        <p className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-tg-link" /> Your Code <button type="button" onClick={() => copy(data.code)} className="font-mono text-xs text-tg-link">{data.code}</button></p>
        <p className="mt-3 flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-tg-quote-bar" /> Referrals <b>{data.referrals}</b></p>
        <p className="flex items-center gap-2 text-sm"><Coins className="h-4 w-4 text-tg-quote-bar" /> Your Credits <b>{data.credits}</b>{data.queued > 0 && <i> (+{data.queued} waiting for tomorrow)</i>}</p>
        <p className="mt-3 text-sm italic">{data.rewards.some((r) => data.credits >= r.credits) ? "Tap a reward below to request admin approval." : "Not enough credits for any reward yet — invite more friends."}</p>
      </Bubble>
      <Keys cols={1}>
        {data.rewards.map((r) => {
          const ok = data.credits >= r.credits;
          return (
            <Key key={r.id} icon={ok ? Gift : Lock} disabled={!ok || busy === r.id} onClick={() => doClaim(r.id)}>
              {r.name} | {r.credits} {ok ? "(claim)" : `(locked ${r.credits - data.credits} more)`}
            </Key>
          );
        })}
        <a href={data.share} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tg-btn-green px-2 py-2 text-sm font-semibold text-tg-btn-fg shadow-sm"><Send className="h-4 w-4" /> Share on Telegram</a>
        <Key tone="green" icon={FileText} onClick={() => setShowBought(true)}>My Purchases ({data.purchases.length})</Key>
        <Key icon={Copy} onClick={() => copy(data.link)}>Copy Link</Key>
        <Key tone="red" icon={ChevronLeft} onClick={() => go("profile")}>Back to Profile</Key>
      </Keys>
    </>
  );
}

