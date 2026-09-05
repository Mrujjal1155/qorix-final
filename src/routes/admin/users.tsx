import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { MinusCircle, PlusCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Shop Bot Admin" },
      { name: "description", content: "Search Telegram bot users, adjust wallet balance, message them or ban abusers." },
      { property: "og:title", content: "Users — Shop Bot Admin" },
      { property: "og:description", content: "Customer management for your Telegram digital shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

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

  type TargetUser = { telegram_id: number; label: string; balance: number };
  const [balanceUser, setBalanceUser] = useState<TargetUser | null>(null);
  const [balanceMode, setBalanceMode] = useState<"add" | "deduct">("add");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceBusy, setBalanceBusy] = useState(false);

  const [msgUser, setMsgUser] = useState<TargetUser | null>(null);
  const [msgText, setMsgText] = useState("");
  const [msgBusy, setMsgBusy] = useState(false);

  function openBalance(u: TargetUser) {
    setBalanceUser(u);
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

  const { data } = useQuery({ queryKey: ["botUsers", search], queryFn: () => fetchUsers({ data: { search } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["botUsers"] });

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      refresh();
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <AdminShell title="Users">
      <div className="mb-4 flex max-w-sm gap-2">
        <Input placeholder="Search username or telegram id" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-semibold">📢 Broadcast (text or image)</p>
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm"
            placeholder="Message text (HTML allowed) — used as image caption; long text is sent as a follow-up message"
            value={bcText}
            onChange={(e) => setBcText(e.target.value)}
          />
          <Input
            placeholder="Image URL (https://...) or Telegram file_id — optional"
            value={bcImage}
            onChange={(e) => setBcImage(e.target.value)}
          />
          <Button disabled={bcBusy || (!bcText.trim() && !bcImage.trim())} onClick={sendBroadcast}>
            {bcBusy ? "Sending..." : "Send broadcast"}
          </Button>
        </CardContent>
      </Card>


      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Telegram ID</th>
                <th>Username</th>
                <th>Balance</th>
                <th>Spent</th>
                <th>Tier</th>
                <th>Refs</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u: any) => (
                <tr key={u.telegram_id} className="border-t border-border">
                  <td className="py-2">{u.telegram_id}</td>
                  <td>{u.username ? `@${u.username}` : (u.first_name ?? "—")}</td>
                  <td>{money(u.balance)}</td>
                  <td>{money(u.total_spent)}</td>
                  <td>{u.membership}</td>
                  <td>{u.referral_count}</td>
                  <td>
                    <Badge variant={u.is_banned ? "destructive" : "secondary"}>
                      {u.is_banned ? "banned" : "active"}
                    </Badge>
                  </td>
                  <td className="space-x-1 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        openBalance({
                          telegram_id: Number(u.telegram_id),
                          label: u.username ? `@${u.username}` : (u.first_name ?? String(u.telegram_id)),
                          balance: Number(u.balance),
                        })
                      }
                    >
                      Balance
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setMsgUser({
                          telegram_id: Number(u.telegram_id),
                          label: u.username ? `@${u.username}` : (u.first_name ?? String(u.telegram_id)),
                          balance: Number(u.balance),
                        });
                        setMsgText("");
                      }}
                    >
                      Message
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(
                          () => ban({ data: { telegram_id: Number(u.telegram_id), banned: !u.is_banned } }),
                          u.is_banned ? "Unbanned" : "Banned",
                        )
                      }
                    >
                      {u.is_banned ? "Unban" : "Ban"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data ?? []).length === 0 && <p className="py-4 text-sm text-muted-foreground">No users found.</p>}
        </CardContent>
      </Card>

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
    </AdminShell>
  );
}
