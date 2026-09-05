import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getMyAccount, updateMyProfile } from "@/lib/account.functions";
import { supabase } from "@/integrations/supabase/client";
import { AccountShell } from "@/components/AccountShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account/profile")({
  head: () => ({
    meta: [
      { title: "Profile settings — QORIX Store" },
      { name: "description", content: "Update your QORIX Store display name and change your account password." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Profile settings — QORIX Store" },
      { property: "og:description", content: "Manage your account details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const fetchAccount = useServerFn(getMyAccount);
  const save = useServerFn(updateMyProfile);
  const { data, refetch } = useQuery({ queryKey: ["my-account"], queryFn: () => fetchAccount() });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.profile.full_name) setName(data.profile.full_name);
  }, [data?.profile.full_name]);

  async function onSaveName() {
    setBusy(true);
    try {
      await save({ data: { full_name: name } });
      toast.success("Profile updated");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      toast.success("Password changed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell title="Profile" subtitle="Your details are only used for order delivery and support.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Account details</CardTitle>
            <CardDescription>{data?.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <Button onClick={onSaveName} disabled={busy || name.trim().length < 2}>
              Save changes
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Use at least 6 characters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>New password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button variant="outline" onClick={onChangePassword} disabled={busy || password.length < 6}>
              Update password
            </Button>
          </CardContent>
        </Card>
      </div>
    </AccountShell>
  );
}
