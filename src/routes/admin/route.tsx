import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Console — QORIX Store" },
      { name: "description", content: "Private administration console for QORIX Store operators." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin Console — QORIX Store" },
      { property: "og:description", content: "Private administration console." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminGate,
});

type State = "loading" | "login" | "denied" | "ok";

function AdminGate() {
  const [state, setState] = useState<State>("loading");

  async function check() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setState("login");
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    setState(roles ? "ok" : "denied");
  }

  useEffect(() => {
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") check();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (state === "ok") return <Outlet />;
  if (state === "loading")
    return (
      <div className="admin-theme flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  return <AdminLogin denied={state === "denied"} />;
}

function AdminLogin({ denied }: { denied: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-theme admin-grid-bg flex min-h-screen items-center justify-center px-4">
      <Card className="admin-panel w-full max-w-sm border-0">
        <CardHeader>
          <CardTitle>Admin console</CardTitle>
          <CardDescription>
            {denied
              ? "This account has no admin access. Sign in with an operator account."
              : "Restricted area. Operator credentials required."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : "Sign in"}
            </Button>
          </form>
          {denied && (
            <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut()}>
              Sign out
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
