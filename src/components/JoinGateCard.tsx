import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus } from "lucide-react";

export type JoinRow = { chat: string; label: string; url: string };

function parseRows(raw: string | undefined): JoinRow[] {
  return (raw ?? "")
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const parts = line.split("|");
      const chat = (parts[0] ?? "").trim();
      const label = parts[1] ?? "";
      const url = (parts[2] ?? "").trim();
      return {
        chat,
        label: label || chat,
        url: url || (chat.startsWith("@") ? `https://t.me/${chat.slice(1)}` : ""),
      };
    });
}

function serializeRows(rows: JoinRow[]): string {
  return rows
    .filter((r) => r.chat.trim())
    .map((r) => `${r.chat.trim()}|${r.label}|${r.url.trim()}`)
    .join("\n");
}

export function JoinGateCard({
  values,
  setValues,
  onSave,
}: {
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  onSave: () => void | Promise<void>;
}) {
  const raw = values["join_channels"] ?? "";
  const [rows, setRows] = useState<JoinRow[]>(() => parseRows(raw));
  const lastPushed = useRef(raw);

  // Keep local rows in sync when settings load / change externally.
  useEffect(() => {
    if (raw !== lastPushed.current) {
      lastPushed.current = raw;
      setRows(parseRows(raw));
    }
  }, [raw]);

  const on = ["on", "true", "1", "yes"].includes((values["join_gate"] ?? "").trim().toLowerCase());

  const update = (next: JoinRow[]) => {
    setRows(next);
    const serialized = serializeRows(next);
    lastPushed.current = serialized;
    setValues({ ...values, join_channels: serialized });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Force join — community channels</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          New users must join every chat listed here before the bot menu opens. Membership is checked live with
          Telegram on <code className="rounded bg-muted px-1 py-0.5 text-xs">/start</code> and on every button tap.
          Make the bot an <strong>admin</strong> in each channel/group, otherwise Telegram cannot report membership.
        </p>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-card/50 p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-semibold">Join gate enabled</Label>
            <p className="text-xs text-muted-foreground">When off, everyone can use the bot without joining.</p>
          </div>
          <Switch
            checked={on}
            onCheckedChange={(c) => setValues({ ...values, join_gate: c ? "on" : "off" })}
            aria-label="Join gate enabled"
          />
        </div>

        <div className="space-y-4">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No channel added yet — add one below.</p>
          )}
          {rows.map((row, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border/70 bg-card/50 p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Channel {i + 1}</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove channel ${i + 1}`}
                  onClick={() => update(rows.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Chat (@username or -100…)</Label>
                  <Input
                    value={row.chat}
                    placeholder="@mychannel"
                    onChange={(e) =>
                      update(rows.map((r, idx) => (idx === i ? { ...r, chat: e.target.value.trim() } : r)))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Button name</Label>
                  <Input
                    value={row.label}
                    placeholder="Main channel"
                    onChange={(e) =>
                      update(rows.map((r, idx) => (idx === i ? { ...r, label: e.target.value } : r)))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Join link</Label>
                  <Input
                    value={row.url}
                    placeholder="https://t.me/mychannel"
                    onChange={(e) =>
                      update(rows.map((r, idx) => (idx === i ? { ...r, url: e.target.value.trim() } : r)))
                    }
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => update([...rows, { chat: "", label: "", url: "" }])}
          >
            <Plus className="mr-2 h-4 w-4" /> Add channel
          </Button>
        </div>

        <div className="grid gap-4">
          <div className="space-y-1">
            <Label>Lock screen title</Label>
            <Input
              value={values["join_gate_title"] ?? ""}
              placeholder="🔒 <b>Membership required</b>"
              onChange={(e) => setValues({ ...values, join_gate_title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Lock screen message</Label>
            <Textarea
              rows={3}
              value={values["join_gate_text"] ?? ""}
              placeholder="Join our official community below, one by one, then tap Verify & continue."
              onChange={(e) => setValues({ ...values, join_gate_text: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Verification success message</Label>
            <Textarea
              rows={3}
              value={values["join_gate_success"] ?? ""}
              placeholder="🎉 Verification successful! Full access unlocked."
              onChange={(e) => setValues({ ...values, join_gate_success: e.target.value })}
            />
          </div>
        </div>

        <Button onClick={onSave}>Save join settings</Button>
      </CardContent>
    </Card>
  );
}
