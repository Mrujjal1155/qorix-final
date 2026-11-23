import { useState } from "react";
import { Settings2, Users, Megaphone, MessageCircle, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  NOTIFY_GROUP_DESTS, NOTIFY_KINDS, defaultNotifyMatrix, notifyChatId, parseNotifyMatrix,
  type NotifyDest, type NotifyMatrix,
} from "@/lib/telegram-notify-routes";

type Props = { values: Record<string, string>; setValues: (v: Record<string, string>) => void; onSave: () => void };

const ICONS: Record<NotifyDest, typeof Users> = { general: Users, updates: Send, channel: Megaphone, dm: MessageCircle };

export function TelegramNotificationsCard({ values, setValues, onSave }: Props) {
  const saved = parseNotifyMatrix(values["notify_routes"]);
  const matrix: NotifyMatrix = saved ?? defaultNotifyMatrix();
  const [open, setOpen] = useState<NotifyDest | null>(null);
  const [draft, setDraft] = useState<NotifyMatrix>(matrix);
  const [chatDraft, setChatDraft] = useState("");

  const rows: { key: NotifyDest; label: string; sub: string }[] = [
    ...NOTIFY_GROUP_DESTS.map((d) => ({ key: d.key as NotifyDest, label: d.label, sub: values[d.linkKey] || "No join link set" })),
    { key: "dm", label: "Bot DM · All users", sub: "Every reachable bot user's private chat" },
  ];

  const openDest = (d: NotifyDest) => {
    setDraft(JSON.parse(JSON.stringify(matrix)));
    setChatDraft(d === "dm" ? "" : values[`notify_chat_${d}`] ?? "");
    setOpen(d);
  };

  const apply = () => {
    if (!open) return;
    const next: Record<string, string> = { ...values, notify_routes: JSON.stringify(draft) };
    if (open !== "dm") next[`notify_chat_${open}`] = chatDraft.trim();
    setValues(next);
    setOpen(null);
  };

  const count = (d: NotifyDest) => NOTIFY_KINDS.filter((k) => matrix[d][k.key]).length;
  const current = rows.find((r) => r.key === open);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram Notifications</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose which notifications go to each group, channel and bot DM. Tap the gear to change.
          {!saved && " Until you save here, notifications keep their current routing."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r, i) => {
          const Icon = ICONS[r.key];
          const chat = r.key === "dm" ? "" : notifyChatId(values, r.key);
          return (
            <div key={r.key} className="flex items-center gap-3 rounded-md border p-3">
              <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
              <Icon className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.label}</div>
                <div className="truncate text-xs text-muted-foreground">{r.sub}</div>
                <div className="text-xs text-muted-foreground">
                  {r.key !== "dm" && (chat ? `Chat ID: ${chat} · ` : "Chat ID missing · ")}
                  {saved ? `${count(r.key)}/${NOTIFY_KINDS.length} on` : "Current routing"}
                </div>
              </div>
              <Button size="icon" variant="outline" aria-label={`${r.label} settings`} onClick={() => openDest(r.key)}>
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        <Button onClick={onSave}>Save</Button>
      </CardContent>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{current?.label}</DialogTitle>
            <DialogDescription>Turn on the notifications this place should receive.</DialogDescription>
          </DialogHeader>
          {open && open !== "dm" && (
            <div className="space-y-1">
              <Label>Chat ID</Label>
              <Input placeholder={notifyChatId({ ...values, [`notify_chat_${open}`]: "" }, open) || "-100…"} value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} />
              <p className="text-xs text-muted-foreground">The bot must be an admin here. Empty uses the current alert group.</p>
            </div>
          )}
          <div className="space-y-2">
            {open && NOTIFY_KINDS.map((k, i) => (
              <div key={k.key} className="flex items-center justify-between gap-3 rounded-md border p-2">
                <span className="text-sm"><span className="mr-2 text-muted-foreground">{i + 1}.</span>{k.label}</span>
                <Switch
                  checked={Boolean(draft[open][k.key])}
                  onCheckedChange={(v) => setDraft({ ...draft, [open]: { ...draft[open], [k.key]: v } })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button>
            <Button onClick={apply}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
