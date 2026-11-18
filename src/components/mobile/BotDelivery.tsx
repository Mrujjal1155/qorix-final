import { Copy, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { deliveryItems, deliveryTxt, showItemsSingly } from "@/lib/delivery-items";

function downloadTxt(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Delivered accounts like the bot: ≤5 one by one with Copy, 6+ as one TXT file. */
export function BotDelivery({ content, orderNo, productName }: { content: string; orderNo: string | number; productName: string }) {
  const items = deliveryItems(content);
  if (!items.length) return null;
  const file = `order-${orderNo}.txt`;
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copied"); };
  const btn = "flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold text-tg-btn-fg shadow-sm";
  return (
    <div className="flex flex-col gap-1.5">
      {showItemsSingly(items.length) ? (
        items.map((it, i) => (
          <div key={i} className="w-full rounded-2xl rounded-bl-md bg-tg-bubble px-3.5 py-2.5 shadow-sm">
            <p className="text-xs font-semibold text-tg-muted">{productName} · {i + 1}/{items.length}</p>
            <pre className="mt-1 whitespace-pre-wrap break-all rounded-md bg-tg-quote p-2 font-mono text-xs">{it}</pre>
            <button type="button" onClick={() => copy(it)} className={`${btn} mt-2 w-full bg-tg-btn`}><Copy className="h-4 w-4" /> Copy</button>
          </div>
        ))
      ) : (
        <div className="w-full rounded-2xl rounded-bl-md bg-tg-bubble px-3.5 py-2.5 shadow-sm">
          <p className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-tg-link" /> {file}</p>
          <p className="mt-1 text-sm">{items.length} accounts in one TXT file.</p>
        </div>
      )}
      <button type="button" onClick={() => downloadTxt(deliveryTxt(items), file)} className={`${btn} bg-tg-btn-green`}><Download className="h-4 w-4" /> Download TXT</button>
    </div>
  );
}
