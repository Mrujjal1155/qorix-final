import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryPremiumIcon } from "@/components/mobile/CategoryPremiumIcon";
import { WEBSITE_PREMIUM_ICONS, websiteEmojiId, websiteIconMedia } from "@/lib/website-premium-icons";
import { saveWebsitePremiumIcons } from "@/lib/website-premium-icons.functions";

export function WebsitePremiumIconsCard({ values, onSaved }: { values: Record<string, string>; onSaved: () => Promise<unknown> }) {
  const save = useServerFn(saveWebsitePremiumIcons);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const previous = useRef<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const oldSaved = previous.current;
    const newSaved = Object.fromEntries(WEBSITE_PREMIUM_ICONS.map(icon => [icon.key, websiteIconMedia(values[icon.key] ?? "")?.emojiId ?? ""]));
    setDraft(current => {
      const next = { ...current };
      for (const icon of WEBSITE_PREMIUM_ICONS) {
        const saved = newSaved[icon.key] ?? "";
        if (!(icon.key in next) || next[icon.key] === oldSaved[icon.key]) next[icon.key] = saved;
      }
      return next;
    });
    previous.current = newSaved;
  }, [values]);
  async function submit() {
    if (!Object.values(draft).every(value => websiteEmojiId.safeParse(value).success)) { toast.error("Enter a Premium emoji ID, or leave the field empty for the default icon."); return; }
    setBusy(true);
    try {
      await save({ data: { values: draft } });
      await Promise.all([onSaved(), queryClient.invalidateQueries({ queryKey: ["site-content"] })]);
      toast.success("Website Premium icons saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save website icons"); }
    finally { setBusy(false); }
  }
  return <Card>
    <CardHeader><CardTitle>Website Premium Icons</CardTitle></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {WEBSITE_PREMIUM_ICONS.map(icon => {
          const media = websiteIconMedia(values[icon.key] ?? "");
          return <div key={icon.key} className="space-y-2">
            <Label htmlFor={icon.key}>{icon.label}</Label>
            <p className="text-xs text-muted-foreground">{icon.area}</p>
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-muted">{media ? <CategoryPremiumIcon key={media.url} media={media} /> : <Send className="h-4 w-4 text-muted-foreground" />}</span>
              <Input id={icon.key} inputMode="numeric" maxLength={25} autoComplete="off" placeholder="Premium emoji ID" value={draft[icon.key] ?? ""} onChange={event => setDraft(current => ({ ...current, [icon.key]: event.target.value.trim() }))} disabled={busy} />
            </div>
          </div>;
        })}
      </div>
      <Button onClick={() => void submit()} disabled={busy}><Save className="h-4 w-4" />{busy ? "Saving…" : "Save website icons"}</Button>
    </CardContent>
  </Card>;
}