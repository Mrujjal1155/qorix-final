import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ListOrdered, Send } from "lucide-react";
import { generateProductList, saveProductListEmojis, sendProductListPost } from "@/lib/product-list.functions";
import { PRODUCT_LIST_EMOJI_KEYS, formatUsd, parseEmoji } from "@/lib/product-list";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Gen = Awaited<ReturnType<typeof generateProductList>>;

export function ProductListPostCard() {
  const gen = useServerFn(generateProductList);
  const save = useServerFn(saveProductListEmojis);
  const send = useServerFn(sendProductListPost);
  const [list, setList] = useState<Gen | null>(null);
  const [emojis, setEmojis] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "gen" | "save" | "send">("");

  const run = async () => {
    setBusy("gen");
    try {
      const r = await gen();
      setList(r);
      setEmojis(r.emojis as Record<string, string>);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  const glyph = (k: string, fb: string) => parseEmoji(emojis[k], fb).glyph;

  return (
    <Card className="mb-4 border-primary/30">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ListOrdered className="size-4 text-primary" /> Product list post
          </p>
          <Button onClick={run} disabled={busy !== ""}>
            {busy === "gen" ? "Generating..." : "Generate Product List"}
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <Label>Product List Emoji</Label>
          <p className="text-xs text-muted-foreground">
            Plain emoji (🔥), a Premium emoji ID, or ID|🔥. Product rows use each product's own emoji.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRODUCT_LIST_EMOJI_KEYS.map((k) => (
              <div key={k.key} className="space-y-1">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <Input
                  value={emojis[k.key] ?? ""}
                  placeholder={k.fallback}
                  onChange={(e) => setEmojis((m) => ({ ...m, [k.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== ""}
            onClick={async () => {
              setBusy("save");
              try {
                await save({ data: { emojis } });
                toast.success("Emoji saved");
                if (list) await run();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              } finally {
                setBusy("");
              }
            }}
          >
            Save emoji
          </Button>
        </div>

        {list && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="font-semibold">
                {glyph("title", "🛍")} {list.storeName} — PRICE LIST
              </p>
              <p className="mb-2 text-xs italic text-muted-foreground">{list.products.length} products available</p>
              <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">PRODUCT</th>
                      <th className="p-2 text-left">PRICE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.products.map((p, i) => (
                      <tr key={i} className="border-t border-border odd:bg-background">
                        <td className="p-2">{parseEmoji(p.emoji, "📦").glyph} {p.name}</td>
                        <td className="whitespace-nowrap p-2">{glyph("price", "💲")} {formatUsd(p.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                <li>{glyph("instant", "✅")} <b>Instant delivery</b> — pay and it arrives in seconds, any hour of the day.</li>
                <li>{glyph("warranty", "🛡")} <b>Covered by warranty</b> — a problem gets replaced, not argued about.</li>
                <li>{glyph("bulk", "🔥")} <b>Cheaper in bulk</b> — larger orders drop the unit price automatically at checkout.</li>
                {list.botUsername && <li>{glyph("order", "🛒")} <b>Order here →</b> @{list.botUsername}</li>}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">Preview — Premium emoji appear in Telegram.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Goes to all bot users + {list.groups} group(s)</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={busy !== ""}>
                    <Send className="mr-2 size-4" />
                    {busy === "send" ? "Sending..." : "Send"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send product list?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This price list goes to every bot user and {list.groups} group(s). This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        setBusy("send");
                        try {
                          const r = await send();
                          toast.success(`Sent to ${r.sent}/${r.total} users · ${r.groupsSent}/${r.groupsTotal} groups`);
                          if (r.failed || r.groupsSent < r.groupsTotal) toast.warning(r.error || "Some messages failed");
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed");
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      Send now
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
