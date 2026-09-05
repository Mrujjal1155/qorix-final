import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Copy, Gift, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { getMyReferral } from "@/lib/referral.functions";
import { AccountShell } from "@/components/AccountShell";
import { priceTag } from "@/components/StoreShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/account/referrals")({
  head: () => ({
    meta: [
      { title: "Referrals & wallet — QORIX Store" },
      {
        name: "description",
        content: "Share your QORIX Store referral link and earn commission into your wallet on every purchase.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Referrals & wallet — QORIX Store" },
      { property: "og:description", content: "Invite friends and earn wallet commission on their orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const fetchReferral = useServerFn(getMyReferral);
  const { data } = useQuery({ queryKey: ["my-referral"], queryFn: () => fetchReferral() });
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = data?.ref_code ? `${origin}/?ref=${data.ref_code}` : "";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  }

  const cards = [
    { label: "Wallet balance", value: priceTag(data?.wallet_balance ?? 0), icon: Wallet },
    { label: "Referral earnings", value: priceTag(data?.referral_earnings ?? 0), icon: Gift },
    { label: "People referred", value: data?.referral_count ?? 0, icon: Users },
  ];

  return (
    <AccountShell title="Referrals & wallet" subtitle={`Earn ${data?.percent ?? 2}% of every order your friends complete`}>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="admin-panel rounded-2xl p-4 lg:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-muted-foreground">{c.label}</p>
              <c.icon className="size-4 shrink-0 text-primary" />
            </div>
            <p className="mt-3 text-2xl font-extrabold tracking-tight tabular-nums lg:text-3xl">{c.value}</p>
          </div>
        ))}
      </div>

      <Card className="mt-6 bg-card/70">
        <CardHeader>
          <CardTitle>Your referral link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={link} className="font-mono text-xs sm:text-sm" />
            <Button onClick={copy} disabled={!link} className="shrink-0">
              {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Your code: <span className="font-mono font-semibold text-foreground">{data?.ref_code ?? "…"}</span> — when
            someone signs up through your link and completes an order, {data?.percent ?? 2}% of that order is added to
            your wallet automatically.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6 bg-card/70">
        <CardHeader>
          <CardTitle>Wallet history</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.transactions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No wallet activity yet. Share your link to start earning.</p>
          ) : (
            <ul className="divide-y divide-border/70 text-sm">
              {(data?.transactions ?? []).map((t: any) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0">
                    <span className="font-medium capitalize">{t.type}</span>
                    {t.note ? <span className="block text-xs text-muted-foreground">{t.note}</span> : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={Number(t.amount) >= 0 ? "font-semibold text-primary" : "font-semibold text-destructive"}>
                      {Number(t.amount) >= 0 ? "+" : "-"}
                      {priceTag(Math.abs(Number(t.amount)))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AccountShell>
  );
}
