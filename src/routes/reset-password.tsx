import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StoreShell } from "@/components/StoreShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isPasswordRecoveryHash, saveRecoveryPassword } from "@/lib/password-recovery";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Reset your reseller password — QORIX Store" },
    { name: "description", content: "Securely set a new password for your QORIX reseller account." },
    { property: "og:title", content: "Reset your reseller password — QORIX Store" },
    { property: "og:description", content: "Recover access to your QORIX reseller account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "saved">("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let recovery = isPasswordRecoveryHash(window.location.hash);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recovery = true;
        if (active) setState("ready");
      }
      if (event === "SIGNED_OUT" && active) setState("invalid");
    });
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (active) setState(recovery && data.user && !authError ? "ready" : "invalid");
      if (recovery) window.history.replaceState(null, "", window.location.pathname);
    }).catch(() => { if (active) setState("invalid"); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state !== "ready" || loading) return;
    setLoading(true);
    setError("");
    try {
      await saveRecoveryPassword(supabase.auth, password, confirmation);
      setState("saved");
      setPassword("");
      setConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password. Please request a new link.");
    } finally { setLoading(false); }
  }

  return <StoreShell>
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle>{state === "saved" ? "Password updated" : "Set a new password"}</CardTitle>
          <CardDescription>{state === "saved" ? "Your reseller password has been changed successfully." : "Choose a new password for your QORIX account."}</CardDescription>
        </CardHeader>
        <CardContent>
          {state === "checking" && <p role="status" className="text-sm text-muted-foreground">Checking your reset link…</p>}
          {state === "invalid" && <div className="space-y-4">
            <p role="alert" className="text-sm text-destructive">This reset link is invalid or expired. Request a new link from reseller sign in.</p>
            <Button asChild className="w-full"><Link to="/reseller/start">Back to reseller sign in</Link></Button>
          </div>}
          {state === "ready" && <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={6} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Saving…" : "Update password"}</Button>
          </form>}
          {state === "saved" && <Button asChild className="w-full"><Link to="/reseller/panel">Open reseller panel</Link></Button>}
        </CardContent>
      </Card>
    </div>
  </StoreShell>;
}