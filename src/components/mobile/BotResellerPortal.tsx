import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, CheckCircle2, Clock3, FileText, Globe, KeyRound, LayoutDashboard, LogIn, Percent, Send, Wallet, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BotFrame } from "@/components/mobile/BotFrame";
import { Bubble, Key, KeyLink, Keys, Quote, Title } from "@/components/mobile/BotStorefront";
import { getMyResellerApplication, submitResellerApplication } from "@/lib/reseller-apply.functions";

type View = "home" | "apply" | "status";
const field = "w-full rounded-xl border border-tg-bubble-fg/15 bg-tg-chat/40 px-3 py-2 text-sm text-tg-bubble-fg outline-none focus:border-tg-link";

export function BotResellerPortal() {
  const [view, setView] = useState<View>("home");
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <BotFrame {...(view === "home" ? {} : { onBack: () => setView("home") })}>
      {view === "home" && <Home signedIn={signedIn} go={setView} />}
      {view === "apply" && <Apply go={setView} />}
      {view === "status" && <Status signedIn={signedIn} go={setView} />}
    </BotFrame>
  );
}

function Home({ signedIn, go }: { signedIn: boolean; go: (v: View) => void }) {
  const perks = [
    { i: Percent, t: "Wholesale pricing", d: "your personal discount on every product" },
    { i: Zap, t: "Instant delivery", d: "auto-delivery returns credentials in the API reply" },
    { i: Wallet, t: "Prepaid wallet", d: "top up once, orders debit your balance" },
    { i: Globe, t: "Website + bot", d: "one API key for your site and Telegram bot" },
  ];
  return (
    <>
      <Bubble>
        <Title>RESELLER PORTAL</Title>
        <p className="mt-1 text-sm">Sell our full catalogue from your own website or Telegram bot — at your own prices, with automatic delivery.</p>
        <div className="mt-2 space-y-1 text-sm">
          {perks.map((p) => (
            <p key={p.t} className="flex items-start gap-2"><p.i className="mt-0.5 h-4 w-4 shrink-0 text-tg-quote-bar" /><span><b>{p.t}</b> — {p.d}</span></p>
          ))}
        </div>
        <Quote>
          <b>How it works</b><br />
          1. Send the application.<br />
          2. We approve you and email your API key.<br />
          3. Top up your wallet.<br />
          4. Connect the API — orders deliver instantly.
        </Quote>
      </Bubble>
      <Keys cols={2}>
        <Key tone="green" icon={Send} onClick={() => go("apply")}>Apply now</Key>
        <Key icon={FileText} onClick={() => go("status")}>Application status</Key>
      </Keys>
      <Keys cols={2}>
        <KeyLink icon={BookOpen} to="/reseller/docs">API docs</KeyLink>
        {signedIn
          ? <KeyLink tone="green" icon={LayoutDashboard} to="/reseller/panel">Dashboard</KeyLink>
          : <KeyLink tone="green" icon={LogIn} to="/reseller/start">Login</KeyLink>}
      </Keys>
    </>
  );
}

function Apply({ go }: { go: (v: View) => void }) {
  const submit = useServerFn(submitResellerApplication);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({ name: "", email: "", telegram: "", website: "", channel: "website", monthly_volume: "", message: "" });
  const set = (k: keyof typeof f) => (e: any) => setF((x) => ({ ...x, [k]: e.target.value }));

  if (done) return (
    <>
      <Bubble>
        <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5 text-tg-btn-green" /> Application received</p>
        <p className="mt-1 text-sm">We will review it and send your API key to <b>{f.email}</b>. Log in with this email to follow the status.</p>
      </Bubble>
      <Keys cols={2}>
        <Key icon={FileText} onClick={() => go("status")}>Application status</Key>
        <KeyLink icon={BookOpen} to="/reseller/docs">API docs</KeyLink>
      </Keys>
    </>
  );

  return (
    <>
      <Bubble className="w-full">
        <Title>APPLY</Title>
        <p className="mt-1 text-sm">Approval usually takes less than 24 hours. Fields with * are required.</p>
        <form
          className="mt-3 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setSending(true);
            try { await submit({ data: f }); setDone(true); toast.success("Application received"); }
            catch (err: any) { toast.error(err?.message ?? "Could not send the application"); }
            finally { setSending(false); }
          }}
        >
          <input className={field} required placeholder="Full name / business name *" value={f.name} onChange={set("name")} />
          <input className={field} required type="email" placeholder="Email *" value={f.email} onChange={set("email")} />
          <input className={field} placeholder="Telegram username" value={f.telegram} onChange={set("telegram")} />
          <input className={field} placeholder="Website / bot link" value={f.website} onChange={set("website")} />
          <select className={field} value={f.channel} onChange={set("channel")} aria-label="Where will you sell?">
            <option value="website">Sell on: Website</option>
            <option value="bot">Sell on: Telegram bot</option>
            <option value="both">Sell on: Both</option>
          </select>
          <input className={field} placeholder="Expected monthly volume" value={f.monthly_volume} onChange={set("monthly_volume")} />
          <textarea className={field} rows={3} placeholder="Tell us about your business" value={f.message} onChange={set("message")} />
          <button type="submit" disabled={sending} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-btn-green text-sm font-bold text-tg-btn-fg disabled:opacity-60">
            <Send className="h-4 w-4" /> {sending ? "Sending…" : "Submit application"}
          </button>
        </form>
      </Bubble>
    </>
  );
}

function Status({ signedIn, go }: { signedIn: boolean; go: (v: View) => void }) {
  const fetchMine = useServerFn(getMyResellerApplication);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyResellerApplication>> | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    setLoading(true);
    fetchMine().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [signedIn, fetchMine]);

  if (!signedIn) return (
    <>
      <Bubble>
        <Title>STATUS</Title>
        <p className="mt-1 text-sm">Log in with the email you applied with to see whether your application is pending, approved or rejected.</p>
      </Bubble>
      <Keys cols={1}><KeyLink tone="green" icon={LogIn} to="/reseller/start">Login</KeyLink></Keys>
    </>
  );

  const app = data?.application;
  const meta = app?.status === "approved"
    ? { I: CheckCircle2, t: "Approved", c: "text-tg-btn-green" }
    : app?.status === "rejected"
      ? { I: XCircle, t: "Rejected", c: "text-tg-btn-red" }
      : { I: Clock3, t: "Pending review", c: "text-tg-link" };
  return (
    <>
      <Bubble>
        <Title>STATUS</Title>
        {loading ? <p className="mt-1 text-sm">Checking…</p> : !app ? (
          <p className="mt-1 text-sm">No application found for <b>{data?.email || "this account"}</b>.</p>
        ) : (
          <div className="mt-1 space-y-1 text-sm">
            <p className={`flex items-center gap-2 text-base font-bold ${meta.c}`}><meta.I className="h-5 w-5" /> {meta.t}</p>
            <p><b>Email:</b> {data?.email}</p>
            <p><b>Applied:</b> {new Date(app.created_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p>
            {app.admin_note && <Quote>{app.admin_note}</Quote>}
          </div>
        )}
      </Bubble>
      <Keys cols={2}>
        {app?.status === "approved"
          ? <KeyLink tone="green" icon={LayoutDashboard} to="/reseller/panel">Dashboard</KeyLink>
          : <Key tone="green" icon={Send} onClick={() => go("apply")}>Apply</Key>}
        <KeyLink icon={KeyRound} to="/reseller/docs">API docs</KeyLink>
      </Keys>
    </>
  );
}
