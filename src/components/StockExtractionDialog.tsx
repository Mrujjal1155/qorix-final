import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { exportUnsoldStock, deleteExportedStock } from "@/lib/stock-extraction.functions";
import { stockExportText, type StockExport } from "@/lib/stock-extraction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Props = { productId: string; productName: string; available: number; onClose: () => void };

export function StockExtractionDialog({ productId, productName, available, onClose }: Props) {
  const [quantity, setQuantity] = useState("1");
  const [exported, setExported] = useState<StockExport | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const exportStock = useServerFn(exportUnsoldStock);
  const deleteStock = useServerFn(deleteExportedStock);
  const qc = useQueryClient();
  const count = Number(quantity);
  const valid = Number.isInteger(count) && count > 0 && count <= Math.min(available, 1000);

  function download(result: StockExport) {
    const blob = new Blob([stockExportText(result.items)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${productName.replace(/[^\p{L}\p{N}._-]+/gu, "-")}-${result.items.length}-${result.export_id}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    setDownloaded(true);
  }

  async function handleExport() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const result = await exportStock({ data: { product_id: productId, quantity: count } });
      setExported(result);
      download(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!exported || !downloaded || busy) return;
    setBusy(true);
    try {
      const result = await deleteStock({ data: { export_id: exported.export_id } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["stock", productId] }),
        qc.invalidateQueries({ queryKey: ["catalogue"] }),
      ]);
      toast.success(result.already_deleted ? "These accounts were already deleted" : `${result.deleted} exported account(s) permanently deleted`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally { setBusy(false); }
  }

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <AlertDialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg sm:w-full">
        <AlertDialogHeader>
          <AlertDialogTitle>{exported ? "Permanently delete exported accounts?" : "Export unsold accounts?"}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {exported
              ? `${exported.items.length} account(s) from ${productName}. Check that your TXT file is saved before deleting. Only these exported accounts will be removed. If any were sold or changed, nothing will be deleted. Removed accounts can be uploaded again.`
              : `${productName} — ${available} available. Export the oldest unsold accounts as a TXT file with their original content and full URLs. Exporting does not remove or reserve stock; deletion requires a second confirmation.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!exported && <div className="space-y-2">
          <Label htmlFor="stock-extraction-quantity">Number of accounts</Label>
          <Input id="stock-extraction-quantity" type="number" min={1} max={Math.min(available, 1000)} step={1} value={quantity} disabled={busy} onChange={(event) => setQuantity(event.target.value)} />
        </div>}
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" disabled={busy} onClick={onClose}>{exported ? "Keep in stock" : "Cancel"}</Button>
          {exported ? <>
            <Button variant="outline" disabled={busy} onClick={() => download(exported)}><Download className="mr-2 h-4 w-4" />Download again</Button>
            <Button variant="destructive" disabled={busy || !downloaded} onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />{busy ? "Deleting…" : "Confirm delete"}</Button>
          </> : <Button disabled={!valid || busy} onClick={handleExport}><Download className="mr-2 h-4 w-4" />{busy ? "Exporting…" : "Confirm export"}</Button>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}