import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import {
  addStock,
  deleteStockItem,
  getManualNote,
  listStock,
  saveManualNote,
} from "@/lib/admin.functions";
import { STOCK_FORMATS, detectFormat, parseStock, type StockFormat } from "@/lib/stock-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Props = { productId: string; productName: string; onClose: () => void };

export function StockManagerCard({ productId, productName, onClose }: Props) {
  const qc = useQueryClient();
  const push = useServerFn(addStock);
  const fetchStock = useServerFn(listStock);
  const removeItem = useServerFn(deleteStockItem);
  const fetchNote = useServerFn(getManualNote);
  const storeNote = useServerFn(saveManualNote);

  const [format, setFormat] = useState<StockFormat>("auto");
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const { data: stock } = useQuery({
    queryKey: ["stock", productId],
    queryFn: () => fetchStock({ data: { product_id: productId } }),
  });
  const { data: noteData } = useQuery({
    queryKey: ["manual-note", productId],
    queryFn: () => fetchNote({ data: { product_id: productId } }),
  });
  const noteValue = note ?? (noteData as any)?.note ?? "";

  const preview = useMemo(() => {
    try {
      return { items: parseStock(raw, format), error: "" };
    } catch (e) {
      return { items: [] as string[], error: e instanceof Error ? e.message : "Parse error" };
    }
  }, [raw, format]);

  const active = STOCK_FORMATS.find((f) => f.value === format)!;
  const detected = raw.trim() ? detectFormat(raw) : null;

  const upload = useMutation({
    mutationFn: () => push({ data: { product_id: productId, lines: raw, format } }),
    onSuccess: (r: any) => {
      setRaw("");
      qc.invalidateQueries({ queryKey: ["stock", productId] });
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      toast.success(`${r.added} stock item(s) added`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = (stock ?? []) as any[];
  const unsold = rows.filter((r) => !r.is_sold).length;

  return (
    <Card className="mt-4">
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate">Bulk stock — {productName}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {unsold} available / {rows.length} total. Once payment completes, each item is sent to the buyer in a separate message as “1 of N”, “2 of N”.
            
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={onClose} aria-label="Close stock panel">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Format</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={format}
                onChange={(e) => setFormat(e.target.value as StockFormat)}
              >
                {STOCK_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{active.help}</p>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Paste bulk data</Label>
                {detected && format === "auto" && <Badge variant="secondary">detected: {detected}</Badge>}
              </div>
              <Textarea
                rows={9}
                className="font-mono text-xs"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={active.example}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => upload.mutate()}
                disabled={!preview.items.length || upload.isPending}
              >
                Upload {preview.items.length || ""} item{preview.items.length === 1 ? "" : "s"}
              </Button>
              <Button variant="outline" onClick={() => setRaw("")} disabled={!raw}>
                Clear
              </Button>
            </div>
            {preview.error && <p className="text-xs text-destructive">{preview.error}</p>}
          </div>

          <div className="space-y-2">
            <Label>Delivery preview (as the buyer receives it)</Label>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3">
              {preview.items.length === 0 && (
                <p className="text-xs text-muted-foreground">Paste data above to see a preview here.</p>
              )}
              {preview.items.slice(0, 8).map((item, i) => (
                <div key={i} className="rounded-lg border border-border bg-background p-2">
                  <p className="mb-1 text-[11px] font-semibold text-primary">
                    📦 {productName} — {i + 1} of {preview.items.length}
                  </p>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">{item}</pre>
                </div>
              ))}
              {preview.items.length > 8 && (
                <p className="text-xs text-muted-foreground">+ {preview.items.length - 8} more…</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <Label>Admin delivery note — manual products (visible to admins in Telegram)</Label>
          <Textarea
            rows={3}
            value={noteValue}
            onChange={(e) => setNote(e.target.value)}
            placeholder={"e.g. Give Netflix profile 3, PIN 1234, 30-day warranty."}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await storeNote({ data: { product_id: productId, note: noteValue } });
                  qc.invalidateQueries({ queryKey: ["manual-note", productId] });
                  toast.success("Note saved");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              Save note
            </Button>
            <p className="text-xs text-muted-foreground">
              When a manual order arrives, this note is shown with the “Deliver now” button in Telegram; whatever the admin sends is delivered to the buyer one by one.
              
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Stock items</Label>
          <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.length === 0 && <p className="p-3 text-xs text-muted-foreground">No stock yet.</p>}
            {rows.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 p-2">
                <span className="w-8 shrink-0 text-center text-xs text-muted-foreground">#{i + 1}</span>
                <pre className="min-w-0 truncate font-mono text-[11px]">{r.content}</pre>
                <span className="flex shrink-0 items-center gap-1">
                  <Badge variant={r.is_sold ? "secondary" : "default"}>{r.is_sold ? "sold" : "ready"}</Badge>
                  {!r.is_sold && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete stock item"
                      onClick={async () => {
                        await removeItem({ data: { id: r.id } });
                        qc.invalidateQueries({ queryKey: ["stock", productId] });
                        qc.invalidateQueries({ queryKey: ["catalogue"] });
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
