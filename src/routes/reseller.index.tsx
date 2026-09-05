import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Bot, CheckCircle2, Globe, KeyRound, Percent, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";
import { StoreShell } from "@/components/StoreShell";
import { ResellerFlowAnimation } from "@/components/ResellerFlowAnimation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitResellerApplication } from "@/lib/reseller-apply.functions";
import { productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/reseller/")({
  head: () => ({
    meta: [
      { title: "Become a Reseller — QORIX API Portal" },
      {
        name: "description",
        content:
          "Apply for a QORIX reseller account: wholesale pricing, wallet balance, instant delivery and a simple REST API for your own website or Telegram bot.",
      },
      { property: "og:title", content: "Become a QORIX Reseller" },
      {
        property: "og:description",
        content: "Wholesale prices, instant auto-delivery and a plug-and-play API for your store or bot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/reseller") },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/reseller") }],
  }),
  component: ResellerApplyPage,
});

const PERKS = [
  { icon: Percent, title: "Wholesale pricing", text: "Every product gets your personal discount off the retail price." },
  { icon: Zap, title: "Instant delivery", text: "Auto-delivery products return the credentials in the API response." },
  { icon: Wallet, title: "Prepaid wallet", text: "Top up once, then every order is debited from your balance." },
  { icon: Globe, title: "Website + bot", text: "One API key powers your website and your Telegram bot." },
];

function ResellerApplyPage() {
  const submit = useServerFn(submitResellerApplication);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    telegram: "",
    website: "",
    channel: "website",
    monthly_volume: "",
    message: "",
  });

  const set = (k: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await submit({ data: form });
      setDone(true);
      toast.success("Application received — we will contact you by email.");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send the application");
    } finally {
      setSending(false);
    }
  };

  return (
    <StoreShell>
      <section className="border-b border-border/60 bg-secondary/30">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <KeyRound className="h-3.5 w-3.5" /> Reseller portal
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Sell our full catalogue from your own website or bot
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
            Apply for an API key, top up your wallet and start reselling every product we stock — at your own prices,
            with automatic delivery handled by us.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <a href="#apply">Apply for reseller access</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/reseller/docs">
                <BookOpen className="mr-2 h-4 w-4" /> Read the API documentation
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/reseller/panel">Already approved? Reseller login</Link>
            </Button>
          </div>

          <ResellerFlowAnimation />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border/70 bg-card p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <p.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-base font-bold">{p.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-2xl font-bold">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "Send the application form below with your business details.",
              "We approve you and email your API key plus your discount rate.",
              "Top up your wallet balance (Binance / manual payment).",
              "Connect the API to your site or bot — orders deliver instantly.",
            ].map((step, i) => (
              <li key={i} className="rounded-2xl border border-border/70 bg-card p-5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="mt-3 text-sm text-muted-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="apply" className="mx-auto max-w-3xl scroll-mt-24 px-6 py-16">
        <h2 className="text-2xl font-bold">Apply for a reseller account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Approval usually takes less than 24 hours. All fields marked * are required.
        </p>

        {done ? (
          <div className="mt-8 rounded-2xl border border-success/40 bg-success/10 p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <h3 className="mt-4 text-lg font-bold">Application received</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              We will review your request and send your API key to <strong>{form.email}</strong>.
            </p>
            <Button asChild className="mt-6" variant="outline">
              <Link to="/reseller/docs">
                <BookOpen className="mr-2 h-4 w-4" /> Meanwhile, read the API docs
              </Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 grid gap-5 rounded-2xl border border-border/70 bg-card p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="r-name">Full name / business name *</Label>
                <Input id="r-name" required value={form.name} onChange={set("name")} placeholder="John Doe" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="r-email">Email *</Label>
                <Input
                  id="r-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={set("email")}
                  placeholder="you@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="r-tg">Telegram username</Label>
                <Input id="r-tg" value={form.telegram} onChange={set("telegram")} placeholder="@yourname" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="r-site">Website / bot link</Label>
                <Input id="r-site" value={form.website} onChange={set("website")} placeholder="https://yourstore.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="r-channel">Where will you sell? *</Label>
                <select
                  id="r-channel"
                  value={form.channel}
                  onChange={set("channel")}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="website">Website</option>
                  <option value="bot">Telegram bot</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="r-vol">Expected monthly volume</Label>
                <Input id="r-vol" value={form.monthly_volume} onChange={set("monthly_volume")} placeholder="$500 – $2000" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="r-msg">Tell us about your business</Label>
              <Textarea
                id="r-msg"
                rows={4}
                value={form.message}
                onChange={set("message")}
                placeholder="Which products are you interested in, how do you sell today, your audience size…"
              />
            </div>
            <Button type="submit" size="lg" disabled={sending}>
              {sending ? "Sending…" : "Send application"}
            </Button>
            <p className="text-xs text-muted-foreground">
              By applying you agree to our <Link to="/terms" className="underline">Terms of Service</Link> and{" "}
              <Link to="/privacy" className="underline">Privacy Policy</Link>.
            </p>
          </form>
        )}
      </section>

      <section className="border-t border-border/60 bg-secondary/20">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-12 text-center">
          <Bot className="h-8 w-8 text-primary" />
          <h2 className="text-xl font-bold">Already approved?</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            The documentation walks you through every endpoint and includes copy-paste code for a website store and a
            Telegram bot — from zero to live in one afternoon.
          </p>
          <Button asChild>
            <Link to="/reseller/docs">Open API documentation</Link>
          </Button>
        </div>
      </section>
    </StoreShell>
  );
}
