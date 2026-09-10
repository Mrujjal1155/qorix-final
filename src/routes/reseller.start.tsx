import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StoreShell } from "@/components/StoreShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { productionUrlFor } from "@/lib/site-url";

export const Route = createFileRoute("/reseller/start")({
  head: () => ({
    meta: [
      { title: "Reseller login & registration — QORIX Store" },
      {
        name: "description",
        content:
          "Approved QORIX resellers register or sign in here to open the reseller panel, generate an API key and top up balance.",
      },
      { property: "og:title", content: "Reseller login & registration — QORIX Store" },
      { property: "og:description", content: "Open your QORIX reseller panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: productionUrlFor("/reseller/start") },
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: productionUrlFor("/reseller/start") }],
  }),
  component: ResellerStartPage,
});

function ResellerStartPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"up" | "in">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("email");
    if (prefill) setEmail(prefill);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/reseller/panel", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "up") {
        await signUpWithBrandedEmail({
          data: { email, password, fullName: name.trim(), reseller: true },
        });
        toast.success("Account created. Check your inbox and confirm your email, then sign in here.");
        setMode("in");
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/reseller/panel", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <StoreShell>
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle>{mode === "up" ? "Create your reseller login" : "Reseller sign in"}</CardTitle>
            <CardDescription>
              Use the same email address you applied with — your reseller panel unlocks automatically once your
              application is approved. The same login also works as a normal customer account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {mode === "up" && (
                <div className="space-y-1.5">
                  <Label htmlFor="rs-name">Full name / business name</Label>
                  <Input id="rs-name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="rs-email">Email</Label>
                <Input
                  id="rs-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rs-pass">Password</Label>
                <Input
                  id="rs-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : mode === "up" ? "Create account" : "Sign in"}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => setMode(mode === "up" ? "in" : "up")}
              className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
            >
              {mode === "up" ? "Already registered? Sign in" : "New here? Create an account"}
            </button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Not approved yet?{" "}
              <Link to="/reseller" className="text-primary">
                Apply as a reseller
              </Link>{" "}
              ·{" "}
              <Link to="/reseller/docs" className="text-primary">
                API docs
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </StoreShell>
  );
}
