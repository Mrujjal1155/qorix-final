import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StoreShell } from "@/components/StoreShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { productionUrlFor } from "@/lib/site-url";
import { useT } from "@/lib/i18n";
import { signUpWithBrandedEmail } from "@/lib/auth-signup.functions";
import { sendPasswordResetEmail } from "@/lib/password-reset.functions";
import { BotFrame, useMobileTemplate } from "@/components/mobile/BotFrame";
import { Bubble, Key, Keys, TelegramConnect, Title } from "@/components/mobile/BotStorefront";
import { ArrowLeft, LogIn, Mail, Send, UserPlus } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in or create an account — QORIX Store" },
      {
        name: "description",
        content: "Log in to QORIX Store to track orders, access delivered digital products and manage your profile.",
      },
      { property: "og:title", content: "Sign in or create an account — QORIX Store" },
      { property: "og:description", content: "Customer login for QORIX Store digital products." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: productionUrlFor("/auth") },
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/auth") }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const t = useT();
  const navigate = useNavigate();
  const mobile = useMobileTemplate();
  const [connecting, setConnecting] = useState(false);
  const [forgotView, setForgotView] = useState(false);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function forgot() {
    const target = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      toast.error("Enter your email above first, then tap Forgot password.");
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail({ data: { email: target } });
      setNotice("If this email is registered, a reset link is on its way. Check spam too.");
      toast.success("If this email is registered, a reset link is on its way. Check spam too.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset link");
    } finally {
      setResetting(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/account", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "up") {
        await signUpWithBrandedEmail({ data: { email, password, fullName: fullName.trim() } });
        toast.success("Account created. Check your email to confirm, then sign in.");
        setNotice("Account created. Check your email to confirm, then sign in.");
        setMode("in");
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/account", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  if (mobile) return <BotFrame onBack={() => { if (connecting) setConnecting(false); else if (forgotView) setForgotView(false); else void navigate({ to: "/" }); }}>
    {connecting ? <TelegramConnect onBack={() => setConnecting(false)} onDone={() => { void navigate({ to: "/account", replace: true }); }} /> : <>
      <form className="flex flex-col gap-2" onSubmit={e => { if (forgotView) { e.preventDefault(); void forgot(); } else void submit(e); }}>
        <Bubble className="w-full">
          <Title>{forgotView ? "FORGOT PASSWORD" : mode === "up" ? "CREATE ACCOUNT" : "SIGN IN"}</Title>
          <div className="mt-4 space-y-3">
            {!forgotView && mode === "up" && <div className="space-y-1.5"><Label htmlFor="mobile-name">Full name</Label><Input id="mobile-name" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required /></div>}
            <div className="space-y-1.5"><Label htmlFor="mobile-email">Email</Label><Input id="mobile-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            {!forgotView && <div className="space-y-1.5"><Label htmlFor="mobile-password">Password</Label><Input id="mobile-password" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} minLength={6} value={password} onChange={e => setPassword(e.target.value)} required /></div>}
            {notice && <p role="status" className="text-sm text-tg-muted">{notice}</p>}
          </div>
        </Bubble>
        <Button type="submit" disabled={loading || resetting} className="min-h-12 w-full bg-tg-btn-green text-tg-btn-fg hover:bg-tg-btn-green/90">{forgotView ? <Mail /> : mode === "up" ? <UserPlus /> : <LogIn />}{loading || resetting ? "Please wait…" : forgotView ? "Send reset link" : mode === "up" ? "Create account" : "Sign in"}</Button>
      </form>
      <Keys cols={1}>
        {!forgotView && <Key icon={Send} onClick={() => { setNotice(""); setConnecting(true); }}>Connect Telegram</Key>}
        {!forgotView && <Key icon={mode === "in" ? UserPlus : LogIn} disabled={loading} onClick={() => { setMode(mode === "in" ? "up" : "in"); setNotice(""); }}>{mode === "in" ? "Sign up" : "Sign in"}</Key>}
        {!forgotView && <Key icon={Mail} onClick={() => { setForgotView(true); setNotice(""); }}>Forgot password?</Key>}
        <Key tone="red" icon={ArrowLeft} onClick={() => { if (forgotView) { setForgotView(false); setNotice(""); } else void navigate({ to: "/" }); }}>{forgotView ? "Back to sign in" : "Main Menu"}</Key>
      </Keys>
    </>}
  </BotFrame>;

  return (
    <StoreShell>
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>{mode === "in" ? t("Welcome back") : t("Create your account")}</CardTitle>
            <CardDescription>
              {mode === "in"
                ? t("Sign in to see your orders and deliveries.")
                : t("Sign up to keep every purchase and delivery in one dashboard.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {mode === "up" && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t("Full name")}</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("Email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("Password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("Please wait…") : mode === "in" ? t("Sign in") : t("Create account")}
              </Button>
              <div className="flex items-center justify-center gap-3 text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setMode(mode === "in" ? "up" : "in")}
                >
                  {mode === "in" ? t("Need an account? Sign up") : t("Already have an account? Sign in")}
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  disabled={resetting}
                  onClick={forgot}
                >
                  {t("Forgot password?")}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </StoreShell>
  );
}
