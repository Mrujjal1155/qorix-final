import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  closeSupportTicket,
  getSupportThread,
  listSupportTickets,
  replySupportTicket,
} from "@/lib/admin.functions";
import { AdminShell } from "@/components/AdminShell";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, CheckCheck, Headset, MessageSquare, Search, SendHorizonal } from "lucide-react";
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

const tno = (n: number) => `#T${String(n).padStart(4, "0")}`;
const initials = (s: string) => (s.replace(/^@/, "").trim()[0] ?? "?").toUpperCase();
function ago(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

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
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const endRef = useRef<HTMLDivElement>(null);

  const tickets = useQuery({ queryKey: ["supportTickets"], queryFn: () => list(), refetchInterval: 10_000 });
  const convo = useQuery({
    queryKey: ["supportThread", openId],
    queryFn: () => thread({ data: { id: openId! } }),
    enabled: !!openId,
    refetchInterval: 6_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["supportTickets"] });
    qc.invalidateQueries({ queryKey: ["supportThread"] });
    qc.invalidateQueries({ queryKey: ["unread-tickets-count"] });
  };

  const messages = ((convo.data as any)?.messages ?? []) as any[];
  const current = (convo.data as any)?.ticket;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, openId]);

  async function send() {
    if (!openId || !text.trim()) return;
    setBusy(true);
    try {
      await reply({ data: { id: openId, body: text.trim() } });
      setText("");
      refresh();
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

  const rows = useMemo(() => {
    const all = (tickets.data ?? []) as any[];
    const s = q.trim().toLowerCase();
    return all.filter(
      (t) =>
        (filter === "all" || t.status === filter) &&
        (!s ||
          [t.username, String(t.telegram_id), t.subject, String(t.ticket_no)].some((x) =>
            String(x ?? "").toLowerCase().includes(s),
          )),
    );
  }, [tickets.data, q, filter]);

  // Index of the last admin message — the "Seen/Sent" tick goes there.
  const lastAdminIdx = messages.map((m) => m.sender).lastIndexOf("admin");
  const seen = current && Number(current.unread_user ?? 0) === 0;

  const conversation = current ? (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
          {initials(current.username || "C")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {current.username ? `@${current.username}` : `ID ${current.telegram_id}`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {tno(current.ticket_no)} · {current.subject}
          </p>
        </div>
        <Badge variant={current.status === "open" ? "default" : "secondary"}>{current.status}</Badge>
        <Button
          variant={current.status === "open" ? "destructive" : "outline"}
          size="sm"
          onClick={() => toggleStatus(current.id, current.status === "open" ? "closed" : "open")}
        >
          {current.status === "open" ? "Close" : "Reopen"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 px-3 py-4">
        {messages.map((m, i) => {
          const mine = m.sender === "admin";
          const showDay = i === 0 || day(messages[i - 1].created_at) !== day(m.created_at);
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 text-center">
                  <span className="rounded-full bg-background px-3 py-1 text-[11px] text-muted-foreground">
                    {day(m.created_at)}
                  </span>
                </div>
              )}
              <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                    {initials(m.sender_name || current.username || "C")}
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-card text-card-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                      mine ? "text-primary-foreground/75" : "text-muted-foreground"
                    }`}
                  >
                    <span>{time(m.created_at)}</span>
                    {mine && i === lastAdminIdx && (
                      seen ? (
                        <span className="flex items-center gap-0.5"><CheckCheck className="h-3 w-3" /> Seen</span>
                      ) : (
                        <span className="flex items-center gap-0.5"><Check className="h-3 w-3" /> Sent</span>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          rows={1}
          className="max-h-32 min-h-[42px] resize-none"
          placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button size="icon" className="h-[42px] w-[42px] shrink-0" disabled={busy || !text.trim()} onClick={send} aria-label="Send reply">
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  ) : openId ? (
    <p className="p-6 text-sm text-muted-foreground">Loading conversation…</p>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <Headset className="h-10 w-10" />
      <p className="text-sm">Pick a conversation to start chatting.</p>
    </div>
  );

  return (
    <AdminShell title="Support">
      <div className="grid gap-4 lg:h-[calc(100vh-9rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search user, ID, ticket…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex gap-1">
              {(["open", "closed", "all"] as const).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} className="flex-1 capitalize" onClick={() => setFilter(f)}>
                  {f}
                </Button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8" />
                <p className="text-sm">No conversations.</p>
              </div>
            )}
            {rows.map((t) => {
              const unread = Number(t.unread_admin ?? 0);
              return (
                <button
                  key={t.id}
                  onClick={() => setOpenId(t.id)}
                  className={`flex w-full min-w-0 items-center gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/60 ${
                    openId === t.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
                    {initials(t.username || "C")}
                    {t.status === "open" && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${unread ? "font-bold" : "font-medium"}`}>
                        {t.username ? `@${t.username}` : t.telegram_id}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{ago(t.updated_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-xs ${unread ? "text-foreground" : "text-muted-foreground"}`}>
                        {tno(t.ticket_no)} · {t.last_message || t.subject}
                      </span>
                      {unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {!isMobile && <Card className="flex min-h-[520px] min-w-0 flex-col overflow-hidden p-0">{conversation}</Card>}
      </div>

      {isMobile && (
        <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
          <DialogContent className="flex h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="sr-only">
              <DialogTitle>Support chat</DialogTitle>
            </DialogHeader>
            {conversation}
          </DialogContent>
        </Dialog>
      )}
    </AdminShell>
  );
}
