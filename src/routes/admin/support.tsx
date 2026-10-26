import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  closeSupportTicket,
  getSupportThread,
  listSupportTickets,
  replySupportTicket,
} from "@/lib/admin.functions";
import { AdminShell } from "@/components/AdminShell";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "Support Tickets — Shop Bot Admin" },
      { name: "description", content: "Read and answer Telegram support tickets, then close them when solved." },
      { property: "og:title", content: "Support Tickets — Shop Bot Admin" },
      { property: "og:description", content: "Customer support inbox for your Telegram digital shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const list = useServerFn(listSupportTickets);
  const thread = useServerFn(getSupportThread);
  const reply = useServerFn(replySupportTicket);
  const setStatus = useServerFn(closeSupportTicket);

  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const tickets = useQuery({ queryKey: ["supportTickets"], queryFn: () => list(), refetchInterval: 15_000 });
  const convo = useQuery({
    queryKey: ["supportThread", openId],
    queryFn: () => thread({ data: { id: openId! } }),
    enabled: !!openId,
    refetchInterval: 10_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["supportTickets"] });
    qc.invalidateQueries({ queryKey: ["supportThread"] });
  };

  async function send() {
    if (!openId || !text.trim()) return;
    setBusy(true);
    try {
      await reply({ data: { id: openId, body: text.trim() } });
      setText("");
      refresh();
      toast.success("Reply sent to the customer on Telegram");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(id: string, status: "open" | "closed") {
    try {
      await setStatus({ data: { id, status } });
      refresh();
      toast.success(status === "closed" ? "Ticket closed" : "Ticket reopened");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const rows = (tickets.data ?? []) as any[];
  const current = (convo.data as any)?.ticket;

  const conversation = current ? (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            #T{String(current.ticket_no).padStart(4, "0")} · {current.subject}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {current.username ? `@${current.username}` : ""} · Telegram ID {current.telegram_id}
          </p>
        </div>
        <Button
          className="shrink-0"
          variant={current.status === "open" ? "destructive" : "outline"}
          size="sm"
          onClick={() => toggleStatus(current.id, current.status === "open" ? "closed" : "open")}
        >
          {current.status === "open" ? "Close ticket" : "Reopen"}
        </Button>
      </div>

      <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-md border border-border p-3 sm:max-h-[420px]">
        {((convo.data as any)?.messages ?? []).map((m: any) => (
          <div
            key={m.id}
            className={`rounded-md p-2 text-sm ${m.sender === "admin" ? "ml-8 bg-primary/10" : "mr-8 bg-muted"}`}
          >
            <p className="mb-1 text-xs text-muted-foreground">
              {m.sender === "admin" ? "Support" : m.sender_name || "Customer"} ·{" "}
              {new Date(m.created_at).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Textarea
          placeholder="Write your reply — it is delivered to the customer inside Telegram"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button disabled={busy || !text.trim()} onClick={send}>
          {busy ? "Sending..." : "Send reply"}
        </Button>
      </div>
    </>
  ) : openId ? (
    <p className="text-sm text-muted-foreground">Loading conversation…</p>
  ) : null;

  return (
    <AdminShell title="Support">
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardContent className="space-y-1 pt-6">
            {rows.length === 0 && <p className="text-sm text-muted-foreground">No tickets yet.</p>}
            {rows.map((t) => (
              <button
                key={t.id}
                onClick={() => setOpenId(t.id)}
                className={`w-full min-w-0 rounded-md border p-2 text-left text-sm ${
                  openId === t.id ? "border-primary bg-muted" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">#T{String(t.ticket_no).padStart(4, "0")}</span>
                  <Badge className="shrink-0" variant={t.status === "open" ? "default" : "secondary"}>
                    {t.status}
                  </Badge>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {t.username ? `@${t.username}` : t.telegram_id} · {t.subject}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Desktop: conversation beside the list */}
        {!isMobile && (
          <Card className="min-w-0">
            <CardContent className="space-y-4 pt-6">
              {!openId && <p className="text-sm text-muted-foreground">Pick a ticket on the left to read it.</p>}
              {conversation}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile: conversation opens as a popup dialog */}
      {isMobile && (
        <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
          <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Support ticket</DialogTitle>
            </DialogHeader>
            {conversation}
          </DialogContent>
        </Dialog>
      )}
    </AdminShell>
  );
}
