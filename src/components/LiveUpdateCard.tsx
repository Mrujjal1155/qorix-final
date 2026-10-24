import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { sendLiveUpdateTest } from "@/lib/admin.functions";
import { LIVE_EMOJI_SLOTS, buildLivePost } from "@/lib/live-update";

const TOGGLES = [
  { key: "live_purchase", kind: "purchase", label: "New purchase", description: "Post when an order is delivered (bot + website)." },
  { key: "live_topup", kind: "topup", label: "Wallet top-up", description: "Post when wallet balance is credited." },
  { key: "live_member", kind: "member", label: "New member", description: "Post when a new user starts the bot or signs up." },
] as const;

export function LiveUpdateCard({
  values,
  setValues,
  onSave,
}: {
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  onSave: () => void;
}) {
  const sendTest = useServerFn(sendLiveUpdateTest);
  const [busy, setBusy] = useState("");
  const isOn = (k: string) => (values[k] ?? "on").toLowerCase() === "on";
  const emoji = Object.fromEntries(LIVE_EMOJI_SLOTS.map((s) => [s.slot, values[`live_emoji_${s.slot}`] ?? ""]));

  const test = async (kind: "purchase" | "topup" | "member") => {
    setBusy(kind);
    try {
      const r = await sendTest({ data: { kind } });
      r.ok ? toast.success("Test post sent to the channel") : toast.error(r.error ?? "Failed");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live update channel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Channel ID or @username</Label>
          <Input
            placeholder="@qorixlab or -100…"
            value={values["live_channel_id"] ?? ""}
            onChange={(e) => setValues({ ...values, live_channel_id: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">The bot must be an admin of this channel. Save before sending a test.</p>
        </div>

        <div className="space-y-3">
          {TOGGLES.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <div className="font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => test(t.kind)}>
                  {busy === t.kind ? "Sending…" : "Test post"}
                </Button>
                <Switch
                  checked={isOn(t.key)}
                  onCheckedChange={(v) => setValues({ ...values, [t.key]: v ? "on" : "off" })}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Premium emoji IDs (optional)</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {LIVE_EMOJI_SLOTS.map((s) => (
              <div key={s.slot} className="space-y-1">
                <div className="text-xs text-muted-foreground">{s.glyph} {s.label}</div>
                <Input
                  inputMode="numeric"
                  placeholder="Custom emoji ID"
                  value={values[`live_emoji_${s.slot}`] ?? ""}
                  onChange={(e) => setValues({ ...values, [`live_emoji_${s.slot}`]: e.target.value.trim() })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Preview</Label>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
            {buildLivePost("purchase", { uid: "2808123968", name: "Ahmed", product: "Gemini 18 Months", qty: 1, method: "binance_pay" }, new Date(), emoji)
              .replace(/<tg-emoji[^>]*>(.*?)<\/tg-emoji>/g, "$1")
              .replace(/<[^>]+>/g, "")}
          </pre>
        </div>

        <Button onClick={onSave}>Save</Button>
      </CardContent>
    </Card>
  );
}
