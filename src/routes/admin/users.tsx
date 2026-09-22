import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { adjustBalance, broadcastMessage, listBotUsers, messageUser, setBanned } from "@/lib/admin.functions";
import { AdminShell, money } from "@/components/AdminShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Ban,
  Megaphone,
  MessageSquare,
  MinusCircle,
  PlusCircle,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — QORIX Admin" },
      { name: "description", content: "Search Telegram bot users, adjust wallet balance, message them or ban abusers." },
      { property: "og:title", content: "Users — QORIX Admin" },
      { property: "og:description", content: "Customer management for your Telegram digital shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

type BotUser = {
  telegram_id: number | string;
  username?: string | null;
  first_name?: string | null;
  balance: number | string;
  total_spent: number | string;
  membership?: string | null;
  referral_count?: number | null;
  is_banned?: boolean | null;
};

type TargetUser = { telegram_id: number; label: string; balance: number };

function userLabel(u: BotUser) {
  return u.username ? `@${u.username}` : (u.first_name ?? String(u.telegram_id));
}

function toTarget(u: BotUser): TargetUser {
  return {
    telegram_id: Number(u.telegram_id),
    label: userLabel(u),
    balance: Number(u.balance),
  };
}

function Avatar({ user }: { user: BotUser }) {
  const letter = (user.username ?? user.first_name ?? "?").replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
      {letter}
    </div>
  );
}

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const fetchUsers = useServerFn(listBotUsers);
  const adjust = useServerFn(adjustBalance);
  const ban = useServerFn(setBanned);
  const dm = useServerFn(messageUser);
  const broadcast = useServerFn(broadcastMessage);
  const [bcText, setBcText] = useState("");
  const [bcImage, setBcImage] = useState("");
  const [bcBusy, setBcBusy] = useState(false);
  const [bcOpen, setBcOpen] = useState(false);

  const [balanceUser, setBalanceUser] = useState<TargetUser | null>(null);
  const [balanceMode, setBalanceMode] = useState<"add" | "deduct">("add");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceBusy, setBalanceBusy] = useState(false);

  const [msgUser, setMsgUser] = useState<TargetUser | null>(null);
  const [msgText, setMsgText] = useState("");
  const [msgBusy, setMsgBusy] = useState(false);

  const [banUser, setBanUser] = useState<{ user: BotUser; next: boolean } | null>(null);
  const [banBusy, setBanBusy] = useState(false);

  function openBalance(u: BotUser) {
    setBalanceUser(toTarget(u));
    setBalanceMode("add");
    setBalanceAmount("");
  }

  async function submitBalance() {
    if (!balanceUser) return;
    const raw = Number(balanceAmount);
    if (!Number.isFinite(raw) || raw <= 0) {
      toast.error("Enter a valid amount greater than 0");
      return;
    }
    const amount = balanceMode === "add" ? raw : -raw;
    setBalanceBusy(true);
    try {
      await adjust({ data: { telegram_id: balanceUser.telegram_id, amount } });
      refresh();
      toast.success(
        `${balanceMode === "add" ? "Added" : "Deducted"} ${money(raw)} ${balanceMode === "add" ? "to" : "from"} ${balanceUser.label}`,
      );
      setBalanceUser(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update balance");
    } finally {
      setBalanceBusy(false);
    }
  }

  async function submitMessage() {
    if (!msgUser || !msgText.trim()) return;
    setMsgBusy(true);
    try {
      await dm({ data: { telegram_id: msgUser.telegram_id, text: msgText.trim() } });
      toast.success(`Message sent to ${msgUser.label}`);
      setMsgUser(null);
      setMsgText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setMsgBusy(false);
    }
  }

  async function submitBan() {
    if (!banUser) return;
    setBanBusy(true);
    try {
      await ban({ data: { telegram_id: Number(banUser.user.telegram_id), banned: banUser.next } });
      refresh();
      toast.success(banUser.next ? `Banned ${userLabel(banUser.user)}` : `Unbanned ${userLabel(banUser.user)}`);
      setBanUser(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBanBusy(false);
    }
  }

  async function sendBroadcast() {
    setBcBusy(true);
    try {
      const r: any = await broadcast({ data: { text: bcText, image_url: bcImage } });
      if (r.total === 0) toast.error("No bot users to broadcast to yet");
      else if (r.sent === 0) toast.error(`Broadcast failed (0/${r.total}). ${r.error ?? ""}`);
      else toast.success(`Broadcast sent to ${r.sent}/${r.total} users`);
      setBcText("");
      setBcImage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Broadcast failed");
    } finally {
      setBcBusy(false);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["botUsers", search],
    queryFn: () => fetchUsers({ data: { search } }) as Promise<BotUser[]>,
  });
  const users = data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["botUsers"] });

  const stats = useMemo(() => {
    const total = users.length;
    const banned = users.filter((u) => u.is_banned).length;
    const balance = users.reduce((s, u) => s + Number(u.balance || 0), 0);
    const spent = users.reduce((s, u) => s + Number(u.total_spent || 0), 0);
    return { total, banned, active: total - banned, balance, spent };
  }, [users]);

  const statCards = [
    { label: "Total users", value: String(stats.total), icon: Users, tone: "bg-primary/10 text-primary" },
    { label: "Active", value: String(stats.active), icon: ShieldCheck, tone: "bg-success/15 text-success" },
    { label: "Banned", value: String(stats.banned), icon: ShieldOff, tone: "bg-destructive/10 text-destructive" },
    { label: "Wallet balance", value: money(stats.balance), icon: Wallet, tone: "bg-brand/15 text-brand" },
  ];

  return (
    <AdminShell title="Users">
      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${s.tone}`}>
                <s.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                <p className="truncate text-lg font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + broadcast toggle */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search username or telegram id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant={bcOpen ? "secondary" : "outline"} onClick={() => setBcOpen((v) => !v)}>
          <Megaphone className="mr-2 size-4" />
          Broadcast
        </Button>
      </div>

      {bcOpen && (
        <Card className="mb-4 border-primary/30">
          <CardContent className="space-y-3 pt-6">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Megaphone className="size-4 text-primary" /> Broadcast to all bot users
            </p>
            <Textarea
              className="min-h-24"
              placeholder="Message text (HTML allowed) — used as image caption; long text is sent as a follow-up message"
              value={bcText}
              onChange={(e) => setBcText(e.target.value)}
            />
            <Input
              placeholder="Image URL (https://...) or Telegram file_id — optional"
              value={bcImage}
              onChange={(e) => setBcImage(e.target.value)}
            />
            <div className="flex justify-end">
              <Button disabled={bcBusy || (!bcText.trim() && !bcImage.trim())} onClick={sendBroadcast}>
                {bcBusy ? "Sending..." : "Send broadcast"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading users…</p>}
        {!isLoading && users.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Users className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No users found.</p>
            </CardContent>
          </Card>
        )}
        {users.map((u) => (
          <Card key={u.telegram_id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Avatar user={u} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{userLabel(u)}</p>
                    <Badge variant={u.is_banned ? "destructive" : "secondary"} className="shrink-0">
                      {u.is_banned ? "banned" : "active"}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">ID: {u.telegram_id}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-secondary/50 p-2.5 text-center">
                <div>
                  <p className="text-[11px] text-muted-foreground">Balance</p>
                  <p className="text-sm font-semibold">{money(u.balance)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Spent</p>
                  <p className="text-sm font-semibold">{money(u.total_spent)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Tier · Refs</p>
                  <p className="truncate text-sm font-semibold">
                    {u.membership ?? "—"} · {u.referral_count ?? 0}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button size="sm" variant="outline" onClick={() => openBalance(u)}>
                  <Wallet className="mr-1.5 size-3.5" /> Balance
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMsgUser(toTarget(u));
                    setMsgText("");
                  }}
                >
                  <MessageSquare className="mr-1.5 size-3.5" /> Message
                </Button>
                <Button
                  size="sm"
                  variant={u.is_banned ? "outline" : "destructive"}
                  onClick={() => setBanUser({ user: u, next: !u.is_banned })}
                >
                  <Ban className="mr-1.5 size-3.5" /> {u.is_banned ? "Unban" : "Ban"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="pr-4 font-medium">Balance</th>
                <th className="pr-4 font-medium">Spent</th>
                <th className="pr-4 font-medium">Tier</th>
                <th className="pr-4 font-medium">Refs</th>
                <th className="pr-4 font-medium">Status</th>
                <th className="text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.telegram_id} className="border-t border-border/60 transition-colors hover:bg-secondary/40">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <Avatar user={u} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{userLabel(u)}</p>
                        <p className="text-xs text-muted-foreground">ID: {u.telegram_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="pr-4 font-medium">{money(u.balance)}</td>
                  <td className="pr-4">{money(u.total_spent)}</td>
                  <td className="pr-4">{u.membership ?? "—"}</td>
                  <td className="pr-4">{u.referral_count ?? 0}</td>
                  <td className="pr-4">
                    <Badge variant={u.is_banned ? "destructive" : "secondary"}>
                      {u.is_banned ? "banned" : "active"}
                    </Badge>
                  </td>
                  <td className="space-x-1 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openBalance(u)}>
                      <Wallet className="mr-1.5 size-3.5" /> Balance
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setMsgUser(toTarget(u));
                        setMsgText("");
                      }}
                    >
                      <MessageSquare className="mr-1.5 size-3.5" /> Message
                    </Button>
                    <Button
                      size="sm"
                      variant={u.is_banned ? "ghost" : "destructive"}
                      onClick={() => setBanUser({ user: u, next: !u.is_banned })}
                    >
                      {u.is_banned ? "Unban" : "Ban"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && users.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Users className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No users found.</p>
            </div>
          )}
          {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading users…</p>}
        </CardContent>
      </Card>

      {/* Balance dialog */}
      <Dialog open={!!balanceUser} onOpenChange={(o) => !o && setBalanceUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust wallet balance</DialogTitle>
            <DialogDescription>
              {balanceUser ? `${balanceUser.label} — current balance ${money(balanceUser.balance)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={balanceMode === "add" ? "default" : "outline"}
                onClick={() => setBalanceMode("add")}
              >
                <PlusCircle className="mr-2 size-4" /> Add
              </Button>
              <Button
                type="button"
                variant={balanceMode === "deduct" ? "destructive" : "outline"}
                onClick={() => setBalanceMode("deduct")}
              >
                <MinusCircle className="mr-2 size-4" /> Deduct
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="balance-amount">Amount (USD)</Label>
              <Input
                id="balance-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitBalance();
                }}
              />
              {balanceUser && Number(balanceAmount) > 0 && (
                <p className="text-xs text-muted-foreground">
                  New balance:{" "}
                  {money(
                    balanceMode === "add"
                      ? balanceUser.balance + Number(balanceAmount)
                      : balanceUser.balance - Number(balanceAmount),
                  )}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceUser(null)}>
              Cancel
            </Button>
            <Button disabled={balanceBusy || !(Number(balanceAmount) > 0)} onClick={submitBalance}>
              {balanceBusy ? "Saving..." : balanceMode === "add" ? "Add balance" : "Deduct balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message dialog */}
      <Dialog open={!!msgUser} onOpenChange={(o) => !o && setMsgUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send message</DialogTitle>
            <DialogDescription>{msgUser ? `To ${msgUser.label}` : ""}</DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-28"
            placeholder="Write your message (HTML allowed)"
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMsgUser(null)}>
              Cancel
            </Button>
            <Button disabled={msgBusy || !msgText.trim()} onClick={submitMessage}>
              {msgBusy ? "Sending..." : "Send message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban confirmation dialog */}
      <Dialog open={!!banUser} onOpenChange={(o) => !o && setBanUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{banUser?.next ? "Ban this user?" : "Unban this user?"}</DialogTitle>
            <DialogDescription>
              {banUser
                ? banUser.next
                  ? `${userLabel(banUser.user)} will no longer be able to use the bot, place orders or earn referral commission.`
                  : `${userLabel(banUser.user)} will regain full access to the bot.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanUser(null)}>
              Cancel
            </Button>
            <Button variant={banUser?.next ? "destructive" : "default"} disabled={banBusy} onClick={submitBan}>
              {banBusy ? "Working..." : banUser?.next ? "Yes, ban user" : "Yes, unban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
