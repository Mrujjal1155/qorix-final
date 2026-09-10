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
  const [mode, setMode] = useState<"in" | "up">("in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setMode(mode === "in" ? "up" : "in")}
              >
                {mode === "in" ? t("Need an account? Sign up") : t("Already have an account? Sign in")}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </StoreShell>
  );
}
